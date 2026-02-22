from models.transaction import TransactionStatus

VALID_TRANSITIONS = {
    TransactionStatus.DRAFT: [TransactionStatus.AWAITING_PAYMENT, TransactionStatus.CANCELLED],
    TransactionStatus.AWAITING_PAYMENT: [TransactionStatus.FUNDED, TransactionStatus.CANCELLED],
    TransactionStatus.FUNDED: [TransactionStatus.GOODS_DELIVERED, TransactionStatus.DISPUTED],
    TransactionStatus.GOODS_DELIVERED: [TransactionStatus.RELEASED, TransactionStatus.DISPUTED],
    TransactionStatus.DISPUTED: [TransactionStatus.RESOLVED],
    TransactionStatus.RESOLVED: [TransactionStatus.RELEASED, TransactionStatus.REFUNDED],
    TransactionStatus.RELEASED: [],
    TransactionStatus.REFUNDED: [],
    TransactionStatus.CANCELLED: [],
}


def can_transition(current: TransactionStatus, target: TransactionStatus) -> bool:
    return target in VALID_TRANSITIONS.get(current, [])


def transition(current: TransactionStatus, target: TransactionStatus) -> TransactionStatus:
    if not can_transition(current, target):
        raise ValueError(f"Invalid transition: {current.value} → {target.value}")
    return target
