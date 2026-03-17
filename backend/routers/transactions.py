import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from models.transaction import Transaction, TransactionStatus
from schemas.transaction import TransactionCreate, TransactionOut, TransactionList, STKPushRequest, STKPushResponse
from utils.deps import get_current_user
from services.ledger import post_deposit, post_release, post_refund
from services.mpesa import mpesa_service

router = APIRouter(prefix="/api/transactions", tags=["Transactions"])


def _enrich(tx: Transaction, db: Session) -> TransactionOut:
    buyer = db.query(User).filter(User.id == tx.buyer_id).first()
    seller = db.query(User).filter(User.id == tx.seller_id).first()
    out = TransactionOut.model_validate(tx)
    out.buyer_name = buyer.full_name if buyer else None
    out.seller_name = seller.full_name if seller else None
    return out


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(data: TransactionCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    seller = db.query(User).filter(User.email == data.seller_email).first()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    if not seller.is_seller:
        raise HTTPException(
            status_code=400, 
            detail="This user has not enabled their seller account. Please ask them to log in and go to 'Become a Seller'."
        )
    if seller.id == user.id:
        raise HTTPException(status_code=400, detail="Cannot create escrow with yourself")

    tx = Transaction(
        buyer_id=user.id,
        seller_id=seller.id,
        title=data.title,
        description=data.description,
        amount=data.amount,
        status=TransactionStatus.CREATED,
        idempotency_key=str(uuid.uuid4()),
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return _enrich(tx, db)


@router.get("", response_model=TransactionList)
def list_transactions(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    txs = db.query(Transaction).filter(
        (Transaction.buyer_id == user.id) | (Transaction.seller_id == user.id)
    ).order_by(Transaction.created_at.desc()).all()
    return TransactionList(transactions=[_enrich(t, db) for t in txs], total=len(txs))


@router.get("/{transaction_id}", response_model=TransactionOut)
def get_transaction(transaction_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx.buyer_id != user.id and tx.seller_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return _enrich(tx, db)


@router.post("/{transaction_id}/initiate-payment", response_model=STKPushResponse)
async def initiate_payment(transaction_id: str, req: STKPushRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).with_for_update().first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx.buyer_id != user.id:
        raise HTTPException(status_code=403, detail="Only buyer can pay")

    result = await mpesa_service.stk_push(
        phone=req.phone_number,
        amount=float(tx.amount),
        account_ref=tx.idempotency_key[:20],
    )
    tx.mpesa_checkout_id = result.get("CheckoutRequestID")
    db.commit()

    return STKPushResponse(
        checkout_request_id=result.get("CheckoutRequestID", ""),
        response_description=result.get("ResponseDescription", "Request accepted"),
    )


@router.post("/{transaction_id}/mark-shipped")
def mark_shipped(transaction_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).with_for_update().first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx.seller_id != user.id:
        raise HTTPException(status_code=403, detail="Only seller can mark as shipped")

    tx.transition_to(TransactionStatus.SHIPPED)
    db.commit()
    return {"status": tx.status.value}


@router.post("/{transaction_id}/confirm-delivery")
def confirm_delivery(transaction_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).with_for_update().first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx.buyer_id != user.id:
        raise HTTPException(status_code=403, detail="Only buyer can confirm delivery")

    tx.transition_to(TransactionStatus.DELIVERED)
    db.commit()
    return {"status": tx.status.value}


@router.post("/{transaction_id}/release")
async def release_funds(transaction_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).with_for_update().first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx.buyer_id != user.id:
        raise HTTPException(status_code=403, detail="Only buyer can release funds")

    tx.release_funds(is_buyer_accepted=True)
    post_release(db, tx)

    seller = db.query(User).filter(User.id == tx.seller_id).first()
    if seller:
        fee = round(float(tx.amount) * 0.025, 2)
        payout = round(float(tx.amount) - fee, 2)
        await mpesa_service.b2c_payout(
            phone=seller.phone,
            amount=payout,
            remarks=f"Payout for: {tx.title}",
        )

    db.commit()
    return {"status": tx.status.value}
