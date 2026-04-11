from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from database import get_db
from models.user import User
from models.transaction import Transaction, TransactionStatus
from models.dispute import Dispute, DisputeStatus
from models.ledger import LedgerEntry, AccountType, EntryType
from schemas.transaction import TransactionOut
from schemas.dispute import DisputeOut, DisputeResolve
from services.ledger import post_release, post_refund
from utils.deps import get_current_user

router = APIRouter(prefix="/api/admin", tags=["Admin"])


def _require_admin(user: User):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")


@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)

    total_volume = db.query(func.coalesce(func.sum(Transaction.amount), 0)).scalar()

    open_disputes = db.query(func.count(Dispute.id)).filter(
        Dispute.status == DisputeStatus.OPEN
    ).scalar()

    completed_txs = db.query(func.count(Transaction.id)).filter(
        Transaction.status.in_([TransactionStatus.RELEASED, TransactionStatus.REFUNDED])
    ).scalar()

    escrow_held = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.status.in_([TransactionStatus.FUNDED, TransactionStatus.SHIPPED, TransactionStatus.DELIVERED, TransactionStatus.DISPUTED])
    ).scalar()

    total_fees = db.query(func.coalesce(func.sum(LedgerEntry.amount), 0)).filter(
        LedgerEntry.account_type == AccountType.FEE,
        LedgerEntry.entry_type == EntryType.CREDIT,
    ).scalar()

    return {
        "total_volume": float(total_volume),
        "open_disputes": int(open_disputes),
        "completed_transactions": int(completed_txs),
        "escrow_held": float(escrow_held),
        "total_fees_earned": float(total_fees),
    }


@router.get("/disputes")
def list_open_disputes(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)

    disputes = (
        db.query(Dispute)
        .filter(Dispute.status == DisputeStatus.OPEN)
        .order_by(Dispute.created_at.desc())
        .all()
    )

    results = []
    for d in disputes:
        tx = db.query(Transaction).filter(Transaction.id == d.transaction_id).first()
        buyer = db.query(User).filter(User.id == tx.buyer_id).first() if tx else None
        seller = db.query(User).filter(User.id == tx.seller_id).first() if tx else None
        raised_by = db.query(User).filter(User.id == d.raised_by).first()
        results.append({
            "id": d.id,
            "transaction_id": d.transaction_id,
            "transaction_title": tx.title if tx else None,
            "amount": float(tx.amount) if tx else 0,
            "buyer_name": buyer.full_name if buyer else None,
            "seller_name": seller.full_name if seller else None,
            "raised_by_name": raised_by.full_name if raised_by else None,
            "reason": d.reason,
            "status": d.status,
            "created_at": d.created_at,
        })
    return results


@router.get("/transactions", response_model=List[TransactionOut])
def list_all_transactions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)

    txs = (
        db.query(Transaction)
        .order_by(Transaction.created_at.desc())
        .limit(50)
        .all()
    )

    results = []
    for tx in txs:
        buyer = db.query(User).filter(User.id == tx.buyer_id).first()
        seller = db.query(User).filter(User.id == tx.seller_id).first()
        out = TransactionOut.model_validate(tx)
        out.buyer_name = buyer.full_name if buyer else None
        out.seller_name = seller.full_name if seller else None
        results.append(out)
    return results


@router.post("/disputes/{dispute_id}/resolve", response_model=DisputeOut)
def admin_resolve_dispute(
    dispute_id: str,
    data: DisputeResolve,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)

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
