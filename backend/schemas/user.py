from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional


class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    phone: Optional[str] = None


class UserOut(BaseModel):
    id: str
    full_name: str
    email: str
    phone: str
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
