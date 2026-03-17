import asyncio
from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
import utils.deps

# Override dependency to mock user
mock_user_email = "buyer@example.com"
mock_seller_email = "derrickgitonga.dev@gmail.com"

def override_get_current_user(db=None):
    from models.user import User
    from database import SessionLocal
    db_session = SessionLocal()
    # Ensure buyer exists
    buyer = db_session.query(User).filter(User.email == mock_user_email).first()
    if not buyer:
        buyer = User(email=mock_user_email, full_name="Buyer", auth0_sub="user_TEST")
        db_session.add(buyer)
        db_session.commit()
        db_session.refresh(buyer)
    db_session.close()
    return buyer

app.dependency_overrides[utils.deps.get_current_user] = override_get_current_user

client = TestClient(app)

response = client.post("/api/transactions", json={
    "seller_email": mock_seller_email,
    "title": "book",
    "description": "new579",
    "amount": 6789
})

print("Status:", response.status_code)
print("Response:", response.text)
