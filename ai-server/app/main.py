"""
VoiceFlow AI Server — FastAPI Application

Entry point for the Python AI/voice service.
Handles VAD, STT, TTS, LLM inference and real-time voice streaming.
"""

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.health import router as health_router
from app.api.voice import router as voice_router
from app.engines.stt import get_stt_engine
from app.engines.tts import get_tts_engine
from app.engines.vad import get_vad_engine


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan: startup and shutdown hooks."""
    # ── Startup ──────────────────────────────────────────────────────────
    print("[VoiceFlow] VoiceFlow AI Server starting...")
    print(f"   Debug: {settings.DEBUG}")
    print(f"   Port: {settings.PORT_AI}")
    
    # Warm up voice engines
    stt = get_stt_engine()
    tts = get_tts_engine()
    vad = get_vad_engine()
    await stt.warmup()
    await tts.warmup()
    await vad.warmup()
    print("[VoiceFlow] AI Server voice engines ready")

    yield

    # ── Shutdown ─────────────────────────────────────────────────────────
    print("[VoiceFlow] Shutting down AI Server...")
    await stt.shutdown()
    await tts.shutdown()
    await vad.shutdown()
    print("[VoiceFlow] AI Server stopped")


# ── Create FastAPI app ───────────────────────────────────────────────────────

app = FastAPI(
    title="VoiceFlow AI Server",
    description="Voice processing and AI inference service for VoiceFlow AI",
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────────────────

app.include_router(health_router)
app.include_router(voice_router)



# ── Development runner ───────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT_AI,
        reload=settings.DEBUG,
    )
