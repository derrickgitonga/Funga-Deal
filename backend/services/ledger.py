from sqlalchemy.orm import Session
from models.ledger import LedgerEntry, AccountType, EntryType
from models.transaction import Transaction


def post_deposit(db: Session, transaction: Transaction):
    entries = [
        LedgerEntry(
            transaction_id=transaction.id,
            account_type=AccountType.BUYER,
            entry_type=EntryType.DEBIT,
            amount=transaction.amount,
            description=f"Deposit for: {transaction.title}",
        ),
        LedgerEntry(
            transaction_id=transaction.id,
            account_type=AccountType.ESCROW,
            entry_type=EntryType.CREDIT,
            amount=transaction.amount,
            description=f"Escrow hold for: {transaction.title}",
        ),
    ]
    db.add_all(entries)


def post_release(db: Session, transaction: Transaction, fee_rate: float = 0.025):
    fee = round(float(transaction.amount) * fee_rate, 2)
    payout = round(float(transaction.amount) - fee, 2)
    entries = [
        LedgerEntry(
            transaction_id=transaction.id,
            account_type=AccountType.ESCROW,
            entry_type=EntryType.DEBIT,
            amount=transaction.amount,
            description=f"Release escrow: {transaction.title}",
        ),
        LedgerEntry(
            transaction_id=transaction.id,
            account_type=AccountType.SELLER,
            entry_type=EntryType.CREDIT,
            amount=payout,
            description=f"Payout to seller: {transaction.title}",
        ),
        LedgerEntry(
            transaction_id=transaction.id,
            account_type=AccountType.FEE,
            entry_type=EntryType.CREDIT,
            amount=fee,
            description=f"Platform fee (2.5%): {transaction.title}",
        ),
    ]
    db.add_all(entries)


def post_refund(db: Session, transaction: Transaction):
    entries = [
        LedgerEntry(
            transaction_id=transaction.id,
            account_type=AccountType.ESCROW,
            entry_type=EntryType.DEBIT,
            amount=transaction.amount,
            description=f"Refund escrow: {transaction.title}",
        ),
        LedgerEntry(
            transaction_id=transaction.id,
            account_type=AccountType.BUYER,
            entry_type=EntryType.CREDIT,
            amount=transaction.amount,
            description=f"Refund to buyer: {transaction.title}",
        ),
    ]
    db.add_all(entries)
