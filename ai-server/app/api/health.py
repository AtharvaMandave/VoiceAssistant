"""
VoiceFlow AI Server — Health Check Router

Reports server status and available engine adapters.
"""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check() -> dict[str, object]:
    """Health check endpoint for monitoring and Docker health checks."""
    return {
        "status": "ok",
        "service": "voiceflow-ai-server",
        "version": "0.1.0",
        "engines": {
            "stt": "not_loaded",  # Will show loaded engine in Phase 4
            "tts": "not_loaded",
            "vad": "not_loaded",
            "llm": "not_loaded",
        },
    }
