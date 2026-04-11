from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
from models.payment_link import DeliveryMethod, PaymentLinkStatus


class PaymentLinkCreate(BaseModel):
    title: str
    description: Optional[str] = None
    price: float
    currency: str = "KES"
    delivery_method: DeliveryMethod = DeliveryMethod.COURIER


class PaymentLinkOut(BaseModel):
    id: str
    seller_id: str
    seller_name: Optional[str] = None
    title: str
    description: Optional[str]
    price: float
    currency: str
    delivery_method: DeliveryMethod
    status: PaymentLinkStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class PaymentLinkList(BaseModel):
    links: List[PaymentLinkOut]
    total: int
