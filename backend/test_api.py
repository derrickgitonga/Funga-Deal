from fastapi.testclient import TestClient
import traceback
from main import app
from database import SessionLocal
from models import Transaction

client = TestClient(app)

db = SessionLocal()
tx = db.query(Transaction).first()

# Mocking get_current_user dependency so it doesn't fail on Auth
from utils.deps import get_current_user
from models import User
app.dependency_overrides[get_current_user] = lambda: db.query(User).filter(User.id == tx.buyer_id).first()

try:
    print(f"Testing POST /api/messages/{tx.id}")
    r = client.post(f"/api/messages/{tx.id}", json={"body": "Test message from backend debugger"})
    print("Response Status:", r.status_code)
    print("Response JSON:", r.json())
except Exception as e:
    traceback.print_exc()
