import os
from typing import List
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from models.transaction import Transaction, TransactionStatus
from models.dispute import Dispute, DisputeStatus, EvidenceFile
from schemas.dispute import DisputeCreate, DisputeOut, EvidenceFileOut, DisputeResolve
from utils.deps import get_current_user
from services.ledger import post_release, post_refund
from config import settings

router = APIRouter(prefix="/api/disputes", tags=["Disputes"])


@router.post("/", response_model=DisputeOut, status_code=201)
def open_dispute(data: DisputeCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tx = db.query(Transaction).filter(Transaction.id == data.transaction_id).with_for_update().first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx.buyer_id != user.id and tx.seller_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    tx.transition_to(TransactionStatus.DISPUTED)

    dispute = Dispute(
        transaction_id=tx.id,
        raised_by=user.id,
        reason=data.reason,
    )
    db.add(dispute)
    db.commit()
    db.refresh(dispute)
    return DisputeOut.model_validate(dispute)


@router.get("/{dispute_id}", response_model=DisputeOut)
def get_dispute(dispute_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    dispute = db.query(Dispute).filter(Dispute.id == dispute_id).first()
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
    return DisputeOut.model_validate(dispute)


@router.post("/{dispute_id}/evidence", response_model=EvidenceFileOut)
async def upload_evidence(
    dispute_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    dispute = db.query(Dispute).filter(Dispute.id == dispute_id).first()
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")

    allowed = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, and PDF files allowed")

    upload_dir = os.path.join(settings.UPLOAD_DIR, dispute_id)
    os.makedirs(upload_dir, exist_ok=True)

    filename = f"{uuid.uuid4()}_{file.filename}"
    filepath = os.path.join(upload_dir, filename)
    with open(filepath, "wb") as f:
        content = await file.read()
        f.write(content)

    evidence = EvidenceFile(
        dispute_id=dispute_id,
        uploader_id=user.id,
        file_name=file.filename,
        file_path=filepath,
        file_type=file.content_type,
    )
    db.add(evidence)
    db.commit()
    db.refresh(evidence)
    return EvidenceFileOut.model_validate(evidence)


@router.get("/{dispute_id}/evidence", response_model=List[EvidenceFileOut])
def list_evidence(dispute_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    files = db.query(EvidenceFile).filter(EvidenceFile.dispute_id == dispute_id).all()
    return [EvidenceFileOut.model_validate(f) for f in files]


@router.post("/{dispute_id}/resolve", response_model=DisputeOut)
def resolve_dispute(
    dispute_id: str,
    data: DisputeResolve,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    dispute = db.query(Dispute).filter(Dispute.id == dispute_id).first()
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")

    tx = db.query(Transaction).filter(Transaction.id == dispute.transaction_id).with_for_update().first()
    
    new_status = TransactionStatus.REFUNDED if data.winner == "buyer" else TransactionStatus.RELEASED
    tx.admin_override(new_status, data.resolution, user.id, db)

    dispute.status = DisputeStatus.RESOLVED_BUYER if data.winner == "buyer" else DisputeStatus.RESOLVED_SELLER
    dispute.resolution = data.resolution

    if data.winner == "buyer":
        post_refund(db, tx)
    else:
        post_release(db, tx)

    db.commit()
    db.refresh(dispute)
    return DisputeOut.model_validate(dispute)
