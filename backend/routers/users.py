from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models.user import User
from utils.deps import get_current_user, _fetch_clerk_user

router = APIRouter(prefix="/api/users", tags=["Users"])


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    is_seller: bool

    model_config = {"from_attributes": True}


@router.get("/me", response_model=UserOut)
def get_me(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.email.endswith("@clerk.local"):
        clerk_data = _fetch_clerk_user(user.auth0_sub)
        primary_email_id = clerk_data.get("primary_email_address_id")
        real_email = None
        for addr in clerk_data.get("email_addresses", []):
            if addr.get("id") == primary_email_id:
                real_email = addr.get("email_address")
                break

        if real_email:
            conflict = db.query(User).filter(User.email == real_email, User.id != user.id).first()
            if conflict:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Another account already uses this email.",
                )
            user.email = real_email

        first = clerk_data.get("first_name") or ""
        last = clerk_data.get("last_name") or ""
        full = f"{first} {last}".strip()
        if full:
            user.full_name = full

        db.commit()
        db.refresh(user)

    return user

@router.put("/me/seller", response_model=UserOut)
def become_seller(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    user.is_seller = True
    db.commit()
    db.refresh(user)
    return user

