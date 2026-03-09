from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db
from models.transaction import Transaction, TransactionStatus
from services.ledger import post_deposit

router = APIRouter(prefix="/api/mpesa", tags=["M-Pesa"])


@router.post("/callback")
async def mpesa_callback(request: Request, db: Session = Depends(get_db)):
    body = await request.json()
    callback = body.get("Body", {}).get("stkCallback", {})
    result_code = callback.get("ResultCode")
    checkout_id = callback.get("CheckoutRequestID")

    if not checkout_id:
        return {"ResultCode": 1, "ResultDesc": "Missing CheckoutRequestID"}

    tx = db.query(Transaction).filter(Transaction.mpesa_checkout_id == checkout_id).with_for_update().first()
    if not tx:
        return {"ResultCode": 0, "ResultDesc": "Accepted"}

    if tx.status == TransactionStatus.FUNDED:
        return {"ResultCode": 0, "ResultDesc": "Already processed"}

    if result_code == 0:
        tx.transition_to(TransactionStatus.FUNDED)
        post_deposit(db, tx)
        db.commit()

    return {"ResultCode": 0, "ResultDesc": "Accepted"}
