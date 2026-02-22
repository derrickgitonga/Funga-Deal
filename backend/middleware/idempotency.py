from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

_processed_keys: set[str] = set()


class IdempotencyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "POST" and "/api/mpesa/callback" in request.url.path:
            body = await request.body()
            import json
            try:
                data = json.loads(body)
                checkout_id = data.get("Body", {}).get("stkCallback", {}).get("CheckoutRequestID", "")
                if checkout_id and checkout_id in _processed_keys:
                    return JSONResponse({"ResultCode": 0, "ResultDesc": "Already processed"})
                if checkout_id:
                    _processed_keys.add(checkout_id)
            except (json.JSONDecodeError, AttributeError):
                pass

        return await call_next(request)
