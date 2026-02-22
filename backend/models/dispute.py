import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Enum, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class DisputeStatus(str, enum.Enum):
    OPEN = "OPEN"
    UNDER_REVIEW = "UNDER_REVIEW"
    RESOLVED_BUYER = "RESOLVED_BUYER"
    RESOLVED_SELLER = "RESOLVED_SELLER"
    CLOSED = "CLOSED"


class Dispute(Base):
    __tablename__ = "disputes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    transaction_id: Mapped[str] = mapped_column(String, ForeignKey("transactions.id"))
    raised_by: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[DisputeStatus] = mapped_column(Enum(DisputeStatus), default=DisputeStatus.OPEN)
    resolution: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    transaction = relationship("Transaction", back_populates="disputes")
    raised_by_user = relationship("User", back_populates="disputes_raised")
    evidence_files = relationship("EvidenceFile", back_populates="dispute")


class EvidenceFile(Base):
    __tablename__ = "evidence_files"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    dispute_id: Mapped[str] = mapped_column(String, ForeignKey("disputes.id"))
    uploader_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    file_name: Mapped[str] = mapped_column(String(255))
    file_path: Mapped[str] = mapped_column(String(500))
    file_type: Mapped[str] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    dispute = relationship("Dispute", back_populates="evidence_files")
    uploader = relationship("User", back_populates="evidence_uploads")
