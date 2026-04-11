import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Numeric, ForeignKey, Enum, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class DeliveryMethod(str, enum.Enum):
    COURIER = "Courier"
    DIGITAL = "Digital"
    SERVICE = "Service"


class PaymentLinkStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class PaymentLink(Base):
    __tablename__ = "payment_links"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    seller_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, nullable=True)
    price: Mapped[float] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(10), default="KES")
    delivery_method: Mapped[DeliveryMethod] = mapped_column(Enum(DeliveryMethod), default=DeliveryMethod.COURIER)
    status: Mapped[PaymentLinkStatus] = mapped_column(Enum(PaymentLinkStatus), default=PaymentLinkStatus.ACTIVE)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    seller = relationship("User", foreign_keys=[seller_id])
