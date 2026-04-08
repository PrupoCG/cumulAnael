"""Application FastAPI pour cumulAnael — Cumul & Démission."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.config import settings
from api.routes import health, suivi_mun

app = FastAPI(
    title="cumulAnael API",
    description="API d'analyse du cumul des mandats et des démissions municipales",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(suivi_mun.router, tags=["suivi-mun"])


@app.get("/")
async def root():
    return {
        "name": "cumulAnael API",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/api/health",
    }
