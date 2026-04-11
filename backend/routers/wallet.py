from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from database import get_db
from models.user import User
from models.transaction import Transaction, TransactionStatus
from models.ledger import LedgerEntry, AccountType, EntryType
from schemas.transaction import TransactionOut
from utils.deps import get_current_user

router = APIRouter(prefix="/api/wallet", tags=["Wallet"])


@router.get("/balance")
def get_wallet_balance(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    escrow_statuses = [TransactionStatus.FUNDED, TransactionStatus.SHIPPED, TransactionStatus.DELIVERED, TransactionStatus.DISPUTED]

    escrow_held = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.buyer_id == user.id,
        Transaction.status.in_(escrow_statuses),
    ).scalar()

    total_spent = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.buyer_id == user.id,
        Transaction.status == TransactionStatus.RELEASED,
    ).scalar()

    seller_credits = db.query(func.coalesce(func.sum(LedgerEntry.amount), 0)).filter(
        LedgerEntry.account_type == AccountType.SELLER,
        LedgerEntry.entry_type == EntryType.CREDIT,
        LedgerEntry.transaction_id.in_(
            db.query(Transaction.id).filter(Transaction.seller_id == user.id)
        ),
    ).scalar()

    return {
        "escrow_held": float(escrow_held),
        "total_spent": float(total_spent),
        "total_earned": float(seller_credits),
    }


@router.get("/transactions", response_model=List[TransactionOut])
def get_wallet_transactions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    txs = (
        db.query(Transaction)
        .filter(
            (Transaction.buyer_id == user.id) | (Transaction.seller_id == user.id)
        )
        .order_by(Transaction.created_at.desc())
        .limit(20)
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
