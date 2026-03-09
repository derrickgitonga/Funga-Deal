import uuid
import enum
from datetime import datetime, timezone, timedelta
from sqlalchemy import String, DateTime, Numeric, ForeignKey, Enum, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class TransactionStatus(str, enum.Enum):
    CREATED = "CREATED"
    FUNDED = "FUNDED"
    SHIPPED = "SHIPPED"
    DELIVERED = "DELIVERED"
    DISPUTED = "DISPUTED"
    RELEASED = "RELEASED"
    REFUNDED = "REFUNDED"


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    buyer_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    seller_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    status: Mapped[TransactionStatus] = mapped_column(Enum(TransactionStatus), default=TransactionStatus.CREATED)
    shipped_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    shipping_timeout_days: Mapped[int] = mapped_column(Integer, default=7)
    inspection_timeout_days: Mapped[int] = mapped_column(Integer, default=3)
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=True)
    mpesa_checkout_id: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    buyer = relationship("User", foreign_keys=[buyer_id], back_populates="buyer_transactions")
    seller = relationship("User", foreign_keys=[seller_id], back_populates="seller_transactions")
    ledger_entries = relationship("LedgerEntry", back_populates="transaction")
    disputes = relationship("Dispute", back_populates="transaction")
    admin_action_logs = relationship("AdminActionLog", back_populates="transaction")

    def transition_to(self, new_status: TransactionStatus):
        VALID_TRANSITIONS = {
            TransactionStatus.CREATED: [TransactionStatus.FUNDED],
            TransactionStatus.FUNDED: [TransactionStatus.SHIPPED, TransactionStatus.REFUNDED],
            TransactionStatus.SHIPPED: [TransactionStatus.DELIVERED, TransactionStatus.DISPUTED],
            TransactionStatus.DELIVERED: [TransactionStatus.RELEASED, TransactionStatus.DISPUTED],
            TransactionStatus.DISPUTED: [TransactionStatus.RELEASED, TransactionStatus.REFUNDED],
            TransactionStatus.RELEASED: [],
            TransactionStatus.REFUNDED: [],
        }

        if new_status not in VALID_TRANSITIONS.get(self.status, []):
            raise ValueError(f"Illegal state transition from {self.status.value} to {new_status.value}")
        
        self.status = new_status
        if new_status == TransactionStatus.SHIPPED:
            self.shipped_at = datetime.now(timezone.utc)
        elif new_status == TransactionStatus.DELIVERED:
            self.delivered_at = datetime.now(timezone.utc)

    def release_funds(self, is_buyer_accepted: bool = False):
        if self.status != TransactionStatus.DELIVERED:
            raise ValueError("Funds can only be released when the transaction is DELIVERED.")
        
        can_release = is_buyer_accepted
        
        if not can_release and self.delivered_at:
            inspection_deadline = self.delivered_at + timedelta(days=self.inspection_timeout_days)
            if datetime.now(timezone.utc) > inspection_deadline:
                can_release = True
        
        if not can_release:
            raise ValueError("Cannot release funds. Buyer has not explicitly accepted and the inspection period has not expired.")
            
        self.transition_to(TransactionStatus.RELEASED)

    def check_and_process_shipping_timeout(self) -> bool:
        if self.status == TransactionStatus.FUNDED:
            shipping_deadline = self.created_at + timedelta(days=self.shipping_timeout_days)
            if datetime.now(timezone.utc) > shipping_deadline:
                self.transition_to(TransactionStatus.REFUNDED)
                return True
        return False

    def check_and_process_inspection_timeout(self) -> bool:
        if self.status == TransactionStatus.DELIVERED:
            if self.delivered_at:
                inspection_deadline = self.delivered_at + timedelta(days=self.inspection_timeout_days)
                if datetime.now(timezone.utc) > inspection_deadline:
                    self.release_funds(is_buyer_accepted=False)
                    return True
        return False

    def admin_override(self, new_status: TransactionStatus, reason_code: str, admin_id: str, db_session):
        if self.status != TransactionStatus.DISPUTED:
            raise ValueError("Admin override can only be used on DISPUTED transactions.")
        
        if new_status not in [TransactionStatus.RELEASED, TransactionStatus.REFUNDED]:
            raise ValueError("Admin override resolving a dispute must result in RELEASED or REFUNDED status.")
            
        self.status = new_status
        
        from .audit import AdminActionLog
        audit_log = AdminActionLog(
            transaction_id=self.id,
            admin_id=admin_id,
            action_type="DISPUTE_OVERRIDE",
            reason_code=reason_code,
            new_status=new_status.value
        )
        db_session.add(audit_log)
