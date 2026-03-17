from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models.transaction import Transaction
from models.message import Message
from models.user import User
from schemas.message import MessageCreate, MessageOut
from utils.deps import get_current_user
from typing import Optional

router = APIRouter(prefix="/api/messages", tags=["Messages"])


def _build(msg: Message, sender: Optional[User]) -> MessageOut:
    return MessageOut(
        id=msg.id,
        transaction_id=msg.transaction_id,
        sender_id=msg.sender_id,
        sender_name=sender.full_name if sender else None,
        body=msg.body,
        created_at=msg.created_at,
    )


@router.get("/{transaction_id}", response_model=list[MessageOut])
def list_messages(transaction_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx.buyer_id != user.id and tx.seller_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    messages = db.query(Message).filter(Message.transaction_id == transaction_id).order_by(Message.created_at).all()
    sender_cache: dict[str, User] = {}
    result = []
    for m in messages:
        if m.sender_id not in sender_cache:
            sender_cache[m.sender_id] = db.query(User).filter(User.id == m.sender_id).first()
        result.append(_build(m, sender_cache[m.sender_id]))
    return result


@router.post("/{transaction_id}", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
def send_message(transaction_id: str, data: MessageCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx.buyer_id != user.id and tx.seller_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    msg = Message(transaction_id=transaction_id, sender_id=user.id, body=data.body.strip())
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return _build(msg, user)

