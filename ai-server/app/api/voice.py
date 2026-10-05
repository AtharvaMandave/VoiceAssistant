"""
VoiceFlow AI Server — Voice API Router

Endpoints for Voice Activity Detection (VAD), Speech-to-Text (STT),
and Text-to-Speech (TTS).
"""

import base64
import time
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel, Field

from app.engines.stt import get_stt_engine
from app.engines.tts import TTSSettings, get_tts_engine
from app.engines.vad import get_vad_engine

router = APIRouter(prefix="/api/voice", tags=["voice"])


# ─── Request / Response Schemas ───────────────────────────────────────────────

class VADRequest(BaseModel):
    audioBase64: str = Field(..., description="Base64-encoded audio bytes")
    sampleRate: int = Field(default=16000, description="Sample rate in Hz")


class VADResponse(BaseModel):
    isSpeech: bool
    confidence: float
    durationMs: float | None = None


class STTRequest(BaseModel):
    audioBase64: str = Field(..., description="Base64-encoded audio bytes")
    filename: str = Field(default="audio.webm", description="Filename or format hint")
    language: str | None = Field(default=None, description="Optional language code (e.g. 'en')")


class STTResponse(BaseModel):
    text: str
    language: str | None = None
    confidence: float | None = None
    durationSeconds: float | None = None
    provider: str
    latencyMs: float


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000, description="Text to synthesize")
    voice: str = Field(default="en-US-AriaNeural", description="Voice ID")
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    pitch: float = Field(default=0.0, ge=-10.0, le=10.0)
    format: str = Field(default="mp3", description="Audio format (mp3 or wav)")
    returnBase64: bool = Field(default=True, description="Whether to return audio as base64 JSON")


class TTSResponse(BaseModel):
    audioBase64: str
    format: str
    sampleRate: int
    durationSeconds: float | None = None
    latencyMs: float


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/voices")
async def list_voices():
    """List all available TTS voices."""
    tts = get_tts_engine()
    return {
        "voices": tts.available_voices,
        "default": "af_heart",
    }


@router.post("/vad", response_model=VADResponse)
async def detect_vad(request: VADRequest):
    """Detect human voice activity in audio chunk."""
    try:
        audio_bytes = base64.b64decode(request.audioBase64)
    except Exception as err:
        raise HTTPException(status_code=400, detail=f"Invalid base64 audio: {err}")

    vad = get_vad_engine()
    result = vad.detect(audio_bytes, sample_rate=request.sampleRate)
    return VADResponse(
        isSpeech=result.is_speech,
        confidence=result.confidence,
        durationMs=result.duration_ms,
    )


@router.post("/stt", response_model=STTResponse)
async def transcribe_audio(request: STTRequest):
    """Transcribe base64-encoded audio to text."""
    try:
        audio_bytes = base64.b64decode(request.audioBase64)
    except Exception as err:
        raise HTTPException(status_code=400, detail=f"Invalid base64 audio: {err}")

    stt = get_stt_engine()
    start_time = time.perf_counter()
    try:
        result = await stt.transcribe(
            audio=audio_bytes,
            language=request.language,
            filename=request.filename,
        )
        latency_ms = round((time.perf_counter() - start_time) * 1000, 1)
        return STTResponse(
            text=result.text,
            language=result.language,
            confidence=result.confidence,
            durationSeconds=result.duration_seconds,
            provider=result.provider,
            latencyMs=latency_ms,
        )
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(err)}")


@router.post("/stt/upload", response_model=STTResponse)
async def transcribe_upload(
    file: UploadFile = File(...),
    language: str | None = Form(default=None),
):
    """Transcribe multipart uploaded audio file to text."""
    audio_bytes = await file.read()
    stt = get_stt_engine()
    start_time = time.perf_counter()
    try:
        result = await stt.transcribe(
            audio=audio_bytes,
            language=language,
            filename=file.filename or "audio.webm",
        )
        latency_ms = round((time.perf_counter() - start_time) * 1000, 1)
        return STTResponse(
            text=result.text,
            language=result.language,
            confidence=result.confidence,
            durationSeconds=result.duration_seconds,
            provider=result.provider,
            latencyMs=latency_ms,
        )
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(err)}")


@router.post("/tts")
async def synthesize_speech(request: TTSRequest):
    """Synthesize text to speech audio."""
    tts = get_tts_engine()
    start_time = time.perf_counter()

    settings = TTSSettings(
        speed=request.speed,
        pitch=request.pitch,
        format=request.format,
    )

    try:
        audio_bytes = await tts.synthesize(
            text=request.text,
            voice=request.voice,
            settings=settings,
        )
        latency_ms = round((time.perf_counter() - start_time) * 1000, 1)

        # Auto-detect format from audio bytes header (Kokoro produces WAV, Edge-TTS produces MP3)
        is_wav = audio_bytes[:4] == b"RIFF"
        detected_format = "audio/wav" if is_wav else "audio/mp3"
        detected_sample_rate = 24000  # Both Kokoro and Edge-TTS use 24kHz

        if request.returnBase64:
            b64_audio = base64.b64encode(audio_bytes).decode("utf-8")
            return TTSResponse(
                audioBase64=b64_audio,
                format=detected_format,
                sampleRate=detected_sample_rate,
                durationSeconds=round(len(request.text.split()) * 0.3, 2),
                latencyMs=latency_ms,
            )
        else:
            return Response(content=audio_bytes, media_type=detected_format)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"TTS synthesis failed: {str(err)}")

