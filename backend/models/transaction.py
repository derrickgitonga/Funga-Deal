import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Numeric, ForeignKey, Enum, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class TransactionStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    AWAITING_PAYMENT = "AWAITING_PAYMENT"
    FUNDED = "FUNDED"
    GOODS_DELIVERED = "GOODS_DELIVERED"
    RELEASED = "RELEASED"
    DISPUTED = "DISPUTED"
    RESOLVED = "RESOLVED"
    REFUNDED = "REFUNDED"
    CANCELLED = "CANCELLED"


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    buyer_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    seller_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    status: Mapped[TransactionStatus] = mapped_column(Enum(TransactionStatus), default=TransactionStatus.DRAFT)
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=True)
    mpesa_checkout_id: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    buyer = relationship("User", foreign_keys=[buyer_id], back_populates="buyer_transactions")
    seller = relationship("User", foreign_keys=[seller_id], back_populates="seller_transactions")
    ledger_entries = relationship("LedgerEntry", back_populates="transaction")
    disputes = relationship("Dispute", back_populates="transaction")
