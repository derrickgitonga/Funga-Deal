from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from models.payment_link import PaymentLink, PaymentLinkStatus
from schemas.payment_link import PaymentLinkCreate, PaymentLinkOut, PaymentLinkList
from utils.deps import get_current_user

router = APIRouter(prefix="/api/payment-links", tags=["Payment Links"])


def _enrich(link: PaymentLink, db: Session) -> PaymentLinkOut:
    seller = db.query(User).filter(User.id == link.seller_id).first()
    out = PaymentLinkOut.model_validate(link)
    out.seller_name = seller.full_name if seller else None
    return out


@router.post("", response_model=PaymentLinkOut, status_code=status.HTTP_201_CREATED)
def create_payment_link(
    data: PaymentLinkCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.is_seller:
        raise HTTPException(status_code=403, detail="Only sellers can create payment links")

    link = PaymentLink(
        seller_id=user.id,
        title=data.title,
        description=data.description,
        price=data.price,
        currency=data.currency,
        delivery_method=data.delivery_method,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return _enrich(link, db)


@router.get("", response_model=PaymentLinkList)
def list_my_payment_links(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    links = (
        db.query(PaymentLink)
        .filter(PaymentLink.seller_id == user.id)
        .order_by(PaymentLink.created_at.desc())
        .all()
    )
    return PaymentLinkList(links=[_enrich(l, db) for l in links], total=len(links))


@router.get("/{link_id}", response_model=PaymentLinkOut)
def get_payment_link(link_id: str, db: Session = Depends(get_db)):
    link = db.query(PaymentLink).filter(PaymentLink.id == link_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Payment link not found")
    return _enrich(link, db)


@router.patch("/{link_id}/deactivate", response_model=PaymentLinkOut)
def deactivate_link(
    link_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    link = db.query(PaymentLink).filter(PaymentLink.id == link_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Payment link not found")
    if link.seller_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    link.status = PaymentLinkStatus.INACTIVE
    db.commit()
    db.refresh(link)
    return _enrich(link, db)
