import psycopg2
from config import settings

print(f"Connecting to {settings.DATABASE_URL.replace('postgresql+psycopg2', 'postgresql')}")
try:
    conn = psycopg2.connect(settings.DATABASE_URL.replace('postgresql+psycopg2', 'postgresql'))
    cur = conn.cursor()
    cur.execute("SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'transactionstatus');")
    print(cur.fetchall())
except Exception as e:
    import traceback
    traceback.print_exc()
