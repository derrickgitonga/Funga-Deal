import requests as http_requests
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from utils.security import verify_clerk_token
from models.user import User
from config import settings

security_scheme = HTTPBearer()


def _fetch_clerk_user(clerk_sub: str) -> dict:
    """Fetch user data from Clerk Backend API using the user ID (sub)."""
    try:
        resp = http_requests.get(
            f"https://api.clerk.com/v1/users/{clerk_sub}",
            headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
            timeout=5,
        )
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass
    return {}


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> User:
    payload = verify_clerk_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    clerk_sub = payload.get("sub")
    if not clerk_sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = db.query(User).filter(User.auth0_sub == clerk_sub).first()
    if user is not None:
        return user

    # Email is not guaranteed in Clerk JWTs — fetch from Backend API.
    email = payload.get("email") or payload.get("email_address")
    name = payload.get("name") or payload.get("full_name")

    if not email:
        clerk_data = _fetch_clerk_user(clerk_sub)
        primary_email_id = clerk_data.get("primary_email_address_id")
        for addr in clerk_data.get("email_addresses", []):
            if addr.get("id") == primary_email_id:
                email = addr.get("email_address")
                break
        if not name:
            first = clerk_data.get("first_name") or ""
            last = clerk_data.get("last_name") or ""
            name = f"{first} {last}".strip()

    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not retrieve email from Clerk. Ensure a valid email is registered.",
        )

    if not name:
        name = email.split("@")[0]

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        existing.auth0_sub = clerk_sub
        db.commit()
        db.refresh(existing)
        return existing

    user = User(auth0_sub=clerk_sub, email=email, full_name=name)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
