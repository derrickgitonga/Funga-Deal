from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class MessageCreate(BaseModel):
    body: str


class MessageOut(BaseModel):
    id: str
    transaction_id: str
    sender_id: str
    sender_name: Optional[str]
    body: str
    created_at: datetime

    model_config = {"from_attributes": True}
