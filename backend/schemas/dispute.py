from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
from models.dispute import DisputeStatus


class DisputeCreate(BaseModel):
    transaction_id: str
    reason: str


class DisputeOut(BaseModel):
    id: str
    transaction_id: str
    raised_by: str
    reason: str
    status: DisputeStatus
    resolution: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class EvidenceFileOut(BaseModel):
    id: str
    dispute_id: str
    uploader_id: str
    file_name: str
    file_type: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DisputeResolve(BaseModel):
    resolution: str
    winner: str  # "buyer" or "seller"
