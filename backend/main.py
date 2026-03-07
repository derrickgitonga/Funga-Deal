from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import engine, Base
from middleware.idempotency import IdempotencyMiddleware
from routers import transactions, disputes, mpesa
from config import settings
import os

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Funga Deal", version="1.0.0", description="Escrow platform for the Kenyan market")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(IdempotencyMiddleware)

app.include_router(transactions.router)
app.include_router(disputes.router)
app.include_router(mpesa.router)

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "Funga Deal API"}
