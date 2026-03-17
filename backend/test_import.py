import sys
import traceback
try:
    from database import Base, engine
    from models.user import User
    from models.transaction import Transaction
    from database import get_db
    print("Imports worked!")
except Exception as e:
    print("Error importing models:")
    traceback.print_exc()
