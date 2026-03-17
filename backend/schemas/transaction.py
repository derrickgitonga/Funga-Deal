from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
from models.transaction import TransactionStatus


class TransactionCreate(BaseModel):
    seller_email: str
    title: str
    description: Optional[str] = None
    amount: float


class TransactionOut(BaseModel):
    id: str
    buyer_id: str
    seller_id: str
    title: str
    description: Optional[str]
    amount: float
    status: TransactionStatus
    cancellation_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    buyer_name: Optional[str] = None
    seller_name: Optional[str] = None

    model_config = {"from_attributes": True}


class CancelRequest(BaseModel):
    reason: str

    model_config = {"from_attributes": True}


class TransactionList(BaseModel):
    transactions: List[TransactionOut]
    total: int


class STKPushRequest(BaseModel):
    transaction_id: str
    phone_number: str


class STKPushResponse(BaseModel):
    checkout_request_id: str
    response_description: str
