import traceback
import sys

sys.path.insert(0, ".")

try:
    from models.message import Message
    from models import User, Transaction
    print("Imports OK")
except Exception:
    traceback.print_exc()
    sys.exit(1)

try:
    from database import SessionLocal
    import uuid
    from datetime import datetime, timezone

    db = SessionLocal()
    
    # Pick the first transaction and its buyer to send a test message
    tx = db.query(Transaction).first()
    if not tx:
        print("No transactions found in DB")
        sys.exit(1)

    print(f"Transaction: {tx.id}, buyer_id={tx.buyer_id}, seller_id={tx.seller_id}")

    msg = Message(
        id=str(uuid.uuid4()),
        transaction_id=tx.id,
        sender_id=tx.buyer_id,
        body="test message",
        created_at=datetime.now(timezone.utc),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    print(f"Message inserted: {msg.id}")
    db.delete(msg)
    db.commit()
    print("Cleaned up test message")
except Exception:
    traceback.print_exc()
