from datetime import datetime, timedelta, timezone
import requests
from typing import Optional
from passlib.context import CryptContext
from jose import JWTError, jwt
from config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def verify_clerk_token(token: str) -> Optional[dict]:
    try:
        # Derive the frontend API host from the publishable key.
        # pk_test_<base64(frontend-api-host)> -> decode to get the host.
        import base64
        raw = settings.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.split("_", 2)[-1]
        # Clerk appends a $ sign; strip it and add padding before decoding.
        padded = raw.rstrip("$") + "=" * (-len(raw.rstrip("$")) % 4)
        frontend_api = base64.b64decode(padded).decode("utf-8").rstrip("$")
        jwks_url = f"https://{frontend_api}/.well-known/jwks.json"
        jwks = requests.get(jwks_url).json()
        unverified_header = jwt.get_unverified_header(token)

        rsa_key = {}
        for key in jwks.get("keys", []):
            if key["kid"] == unverified_header["kid"]:
                rsa_key = {
                    "kty": key["kty"],
                    "kid": key["kid"],
                    "use": key["use"],
                    "n": key["n"],
                    "e": key["e"]
                }
                break

        if rsa_key:
            payload = jwt.decode(
                token,
                rsa_key,
                algorithms=["RS256"],
                options={"verify_aud": False}
            )
            return payload
    except Exception as e:
        print(f"Token validation error: {e}")
    return None
