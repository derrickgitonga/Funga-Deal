from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from models.ledger import AccountType, EntryType


class LedgerEntryOut(BaseModel):
    id: str
    transaction_id: str
    account_type: AccountType
    entry_type: EntryType
    amount: float
    description: str
    created_at: datetime

    model_config = {"from_attributes": True}
