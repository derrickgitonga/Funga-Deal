from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from database import get_db
from models.user import User
from models.transaction import Transaction, TransactionStatus
from models.audit import AdminActionLog
from models.message import Message
from models.dispute import Dispute, DisputeStatus
from models.ledger import LedgerEntry, AccountType, EntryType
from services.ledger import post_release, post_refund
from utils.deps import _fetch_clerk_user
from config import settings

router = APIRouter(prefix="/api/moderator", tags=["Moderator"])

TERMINAL = {TransactionStatus.RELEASED, TransactionStatus.REFUNDED, TransactionStatus.CANCELLED}


def _require_moderator(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    expected = settings.MOD_SECRET or "funga-mod-internal-2024"
    if request.headers.get("X-Mod-Secret") != expected:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    clerk_sub = request.headers.get("X-Clerk-Sub", "")
    if not clerk_sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing user")

    user = db.query(User).filter(User.auth0_sub == clerk_sub).first()
    if user:
        return user

    clerk_data = _fetch_clerk_user(clerk_sub)
    primary_email_id = clerk_data.get("primary_email_address_id")
    email = None
    for addr in clerk_data.get("email_addresses", []):
        if addr.get("id") == primary_email_id:
            email = addr.get("email_address")
            break
    first = clerk_data.get("first_name") or ""
    last = clerk_data.get("last_name") or ""
    name = f"{first} {last}".strip() or (email.split("@")[0] if email else clerk_sub)

    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not resolve user")

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        existing.auth0_sub = clerk_sub
        db.commit()
        db.refresh(existing)
        return existing

    user = User(auth0_sub=clerk_sub, email=email, full_name=name)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _enrich(tx: Transaction, db: Session) -> dict:
    buyer = db.query(User).filter(User.id == tx.buyer_id).first()
    seller = db.query(User).filter(User.id == tx.seller_id).first()
    dispute = db.query(Dispute).filter(
        Dispute.transaction_id == tx.id,
        Dispute.status == DisputeStatus.OPEN,
    ).first()
    return {
        "id": tx.id,
        "title": tx.title,
        "description": tx.description,
        "amount": float(tx.amount),
        "status": tx.status.value,
        "buyer_id": tx.buyer_id,
        "seller_id": tx.seller_id,
        "buyer_name": buyer.full_name if buyer else None,
        "seller_name": seller.full_name if seller else None,
        "buyer_email": buyer.email if buyer else None,
        "seller_email": seller.email if seller else None,
        "cancellation_reason": tx.cancellation_reason,
        "has_open_dispute": dispute is not None,
        "dispute_reason": dispute.reason if dispute else None,
        "created_at": tx.created_at.isoformat(),
        "updated_at": tx.updated_at.isoformat(),
    }


@router.get("/stats")
def moderator_stats(
    db: Session = Depends(get_db),
    _: User = Depends(_require_moderator),
):
    counts = dict(
        db.query(Transaction.status, func.count(Transaction.id))
        .group_by(Transaction.status)
        .all()
    )
    total_volume = db.query(func.coalesce(func.sum(Transaction.amount), 0)).scalar()
    escrow_held = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(Transaction.status.in_([
            TransactionStatus.FUNDED,
            TransactionStatus.SHIPPED,
            TransactionStatus.DELIVERED,
            TransactionStatus.DISPUTED,
        ]))
        .scalar()
    )
    open_disputes = db.query(func.count(Dispute.id)).filter(
        Dispute.status == DisputeStatus.OPEN
    ).scalar()
    total_fees = db.query(func.coalesce(func.sum(LedgerEntry.amount), 0)).filter(
        LedgerEntry.account_type == AccountType.FEE,
        LedgerEntry.entry_type == EntryType.CREDIT,
    ).scalar()

    return {
        "total": sum(counts.values()),
        "by_status": {k.value: v for k, v in counts.items()},
        "total_volume": float(total_volume),
        "escrow_held": float(escrow_held),
        "open_disputes": int(open_disputes),
        "total_fees_earned": float(total_fees),
    }


@router.get("/transactions")
def list_all_transactions(
    db: Session = Depends(get_db),
    _: User = Depends(_require_moderator),
):
    txs = (
        db.query(Transaction)
        .order_by(Transaction.updated_at.desc())
        .limit(300)
        .all()
    )
    return [_enrich(tx, db) for tx in txs]


@router.get("/transactions/{tx_id}/messages")
def get_messages(
    tx_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(_require_moderator),
):
    tx = db.query(Transaction).filter(Transaction.id == tx_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    msgs = db.query(Message).filter(Message.transaction_id == tx_id).order_by(Message.created_at).all()
    result = []
    for m in msgs:
        sender = db.query(User).filter(User.id == m.sender_id).first()
        result.append({
            "id": m.id,
            "sender_id": m.sender_id,
            "sender_name": sender.full_name if sender else "System",
            "body": m.body,
            "created_at": m.created_at.isoformat(),
        })
    return result


class OverrideRequest(BaseModel):
    new_status: str
    reason: str


@router.post("/transactions/{tx_id}/override")
def force_override(
    tx_id: str,
    req: OverrideRequest,
    db: Session = Depends(get_db),
    mod: User = Depends(_require_moderator),
):
    try:
        new_status = TransactionStatus(req.new_status.upper())
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Unknown status: {req.new_status}")

    if not req.reason.strip():
        raise HTTPException(status_code=422, detail="Reason is required")

    tx = db.query(Transaction).filter(Transaction.id == tx_id).with_for_update().first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if tx.status in TERMINAL:
        raise HTTPException(status_code=409, detail=f"Cannot override terminal status {tx.status.value}")

    if new_status == tx.status:
        raise HTTPException(status_code=409, detail="Transaction is already in that status")

    old_status = tx.status
    tx.status = new_status
    tx.cancellation_reason = f"Moderator override ({mod.full_name}): {req.reason}" if new_status == TransactionStatus.CANCELLED else tx.cancellation_reason

    if new_status == TransactionStatus.RELEASED:
        post_release(db, tx)
    elif new_status == TransactionStatus.REFUNDED:
        post_refund(db, tx)

    if new_status in (TransactionStatus.RELEASED, TransactionStatus.REFUNDED):
        open_disputes = db.query(Dispute).filter(
            Dispute.transaction_id == tx_id,
            Dispute.status == DisputeStatus.OPEN,
        ).all()
        resolved_status = DisputeStatus.RESOLVED_SELLER if new_status == TransactionStatus.RELEASED else DisputeStatus.RESOLVED_BUYER
        for d in open_disputes:
            d.status = resolved_status
            d.resolution = f"Moderator override: {req.reason}"

    log = AdminActionLog(
        transaction_id=tx_id,
        admin_id=mod.id,
        action_type="MODERATOR_OVERRIDE",
        reason_code=req.reason[:50],
        new_status=new_status.value,
    )
    db.add(log)
    db.commit()

    sys_msg = Message(
        transaction_id=tx_id,
        sender_id=mod.id,
        body=f"[SYSTEM] Moderator {mod.full_name} overrode status from {old_status.value} to {new_status.value}. Reason: {req.reason}",
    )
    db.add(sys_msg)
    db.commit()

    return {"status": new_status.value}


class MessageRequest(BaseModel):
    body: str


@router.post("/transactions/{tx_id}/message")
def inject_message(
    tx_id: str,
    req: MessageRequest,
    db: Session = Depends(get_db),
    mod: User = Depends(_require_moderator),
):
    body = req.body.strip()
    if not body or len(body) > 2000:
        raise HTTPException(status_code=422, detail="Message must be 1–2000 characters")

    tx = db.query(Transaction).filter(Transaction.id == tx_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    msg = Message(
        transaction_id=tx_id,
        sender_id=mod.id,
        body=f"[MODERATOR] {body}",
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return {"id": msg.id}


@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(_require_moderator),
):
    users = db.query(User).order_by(User.created_at.desc()).limit(200).all()
    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "phone": u.phone,
            "is_seller": u.is_seller,
            "is_active": getattr(u, "is_active", True),
            "kyc_status": u.kyc_status.value,
            "created_at": u.created_at.isoformat(),
        }
        for u in users
    ]
