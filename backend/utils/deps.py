from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from utils.security import verify_auth0_token
from models.user import User

security_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> User:
    payload = verify_auth0_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        
    auth0_sub = payload.get("sub")
    if not auth0_sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = db.query(User).filter(User.auth0_sub == auth0_sub).first()
    if user is None:
        # Auto-provision the user using claims if they don't exist in db
        email = payload.get("https://funga_deal/email") or payload.get("email") or f"{auth0_sub}@auth0.local"
        name = payload.get("https://funga_deal/name") or payload.get("name") or email.split("@")[0]
        
        user = User(
            auth0_sub=auth0_sub,
            email=email,
            full_name=name,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    return user
