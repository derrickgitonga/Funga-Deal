import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base

class AdminActionLog(Base):
    __tablename__ = "admin_action_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    admin_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    transaction_id: Mapped[str] = mapped_column(String, ForeignKey("transactions.id"))
    action_type: Mapped[str] = mapped_column(String(50))
    reason_code: Mapped[str] = mapped_column(String(50))
    new_status: Mapped[str] = mapped_column(String(50), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    admin = relationship("User", foreign_keys=[admin_id])
    transaction = relationship("Transaction", foreign_keys=[transaction_id], back_populates="admin_action_logs")
