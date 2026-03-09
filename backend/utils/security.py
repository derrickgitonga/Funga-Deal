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
        jwks_url = "https://api.clerk.com/v1/jwks"
        headers = {"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"}
        jwks = requests.get(jwks_url, headers=headers).json()
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
