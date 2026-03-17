import uuid
from datetime import datetime, timezone
import enum
from sqlalchemy import String, DateTime, Enum
import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class KYCStatus(str, enum.Enum):
    UNVERIFIED = "UNVERIFIED"
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    auth0_sub: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=True)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str] = mapped_column(String(15), unique=True, index=True, nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=True)
    is_seller: Mapped[bool] = mapped_column(sa.Boolean, server_default=sa.text('false'), default=False)
    is_admin: Mapped[bool] = mapped_column(sa.Boolean, server_default=sa.text('false'), default=False)
    kyc_status: Mapped[KYCStatus] = mapped_column(Enum(KYCStatus), server_default=sa.text("'UNVERIFIED'"), default=KYCStatus.UNVERIFIED)
    id_front_url: Mapped[str] = mapped_column(sa.String(255), nullable=True)
    id_back_url: Mapped[str] = mapped_column(sa.String(255), nullable=True)
    selfie_url: Mapped[str] = mapped_column(sa.String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    buyer_transactions = relationship("Transaction", foreign_keys="Transaction.buyer_id", back_populates="buyer")
    seller_transactions = relationship("Transaction", foreign_keys="Transaction.seller_id", back_populates="seller")
    disputes_raised = relationship("Dispute", back_populates="raised_by_user")
    evidence_uploads = relationship("EvidenceFile", back_populates="uploader")
