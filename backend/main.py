# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from contextlib import asynccontextmanager

from cache_store import get_cached_alert
from scheduler import update_telemetry_job

scheduler = AsyncIOScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Executa a coleta imediatamente ao subir o servidor
    await update_telemetry_job()
    # Agenda a atualização a cada 15 minutos
    scheduler.add_job(update_telemetry_job, "interval", minutes=15)
    scheduler.start()
    yield
    scheduler.shutdown()

app = FastAPI(title="joinville-alerta-v2 API", lifespan=lifespan)

# Libera o acesso CORS para o front-end
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/v1/status-geral")
async def get_status_geral():
    # Retorna o resultado direto da RAM (< 5ms)
    return get_cached_alert()