import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Numeric, ForeignKey, Enum, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class AccountType(str, enum.Enum):
    BUYER = "BUYER"
    SELLER = "SELLER"
    ESCROW = "ESCROW"
    FEE = "FEE"


class EntryType(str, enum.Enum):
    DEBIT = "DEBIT"
    CREDIT = "CREDIT"


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    transaction_id: Mapped[str] = mapped_column(String, ForeignKey("transactions.id"))
    account_type: Mapped[AccountType] = mapped_column(Enum(AccountType))
    entry_type: Mapped[EntryType] = mapped_column(Enum(EntryType))
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    description: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    transaction = relationship("Transaction", back_populates="ledger_entries")
