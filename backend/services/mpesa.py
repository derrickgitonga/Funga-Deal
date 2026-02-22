import base64
from datetime import datetime
import httpx
from config import settings


class MpesaService:
    SANDBOX_URL = "https://sandbox.safaricom.co.ke"
    PRODUCTION_URL = "https://api.safaricom.co.ke"

    @property
    def base_url(self) -> str:
        return self.PRODUCTION_URL if settings.MPESA_ENV == "production" else self.SANDBOX_URL

    async def _get_access_token(self) -> str:
        credentials = base64.b64encode(
            f"{settings.MPESA_CONSUMER_KEY}:{settings.MPESA_CONSUMER_SECRET}".encode()
        ).decode()
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/oauth/v1/generate?grant_type=client_credentials",
                headers={"Authorization": f"Basic {credentials}"},
            )
            response.raise_for_status()
            return response.json()["access_token"]

    def _generate_password(self) -> tuple[str, str]:
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        raw = f"{settings.MPESA_SHORTCODE}{settings.MPESA_PASSKEY}{timestamp}"
        password = base64.b64encode(raw.encode()).decode()
        return password, timestamp

    async def stk_push(self, phone: str, amount: float, account_ref: str) -> dict:
        token = await self._get_access_token()
        password, timestamp = self._generate_password()
        payload = {
            "BusinessShortCode": settings.MPESA_SHORTCODE,
            "Password": password,
            "Timestamp": timestamp,
            "TransactionType": "CustomerPayBillOnline",
            "Amount": int(amount),
            "PartyA": phone,
            "PartyB": settings.MPESA_SHORTCODE,
            "PhoneNumber": phone,
            "CallBackURL": f"{settings.MPESA_CALLBACK_URL}/api/mpesa/callback",
            "AccountReference": account_ref,
            "TransactionDesc": f"Escrow deposit: {account_ref}",
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/mpesa/stkpush/v1/processrequest",
                json=payload,
                headers={"Authorization": f"Bearer {token}"},
            )
            response.raise_for_status()
            return response.json()

    async def b2c_payout(self, phone: str, amount: float, remarks: str) -> dict:
        token = await self._get_access_token()
        payload = {
            "InitiatorName": settings.MPESA_B2C_INITIATOR,
            "SecurityCredential": settings.MPESA_B2C_PASSWORD,
            "CommandID": "BusinessPayment",
            "Amount": int(amount),
            "PartyA": settings.MPESA_SHORTCODE,
            "PartyB": phone,
            "Remarks": remarks,
            "QueueTimeOutURL": settings.MPESA_B2C_QUEUE_URL,
            "ResultURL": settings.MPESA_B2C_RESULT_URL,
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/mpesa/b2c/v1/paymentrequest",
                json=payload,
                headers={"Authorization": f"Bearer {token}"},
            )
            response.raise_for_status()
            return response.json()


mpesa_service = MpesaService()
