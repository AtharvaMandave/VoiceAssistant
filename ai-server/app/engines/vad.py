"""
VoiceFlow AI — VAD Engine Implementations

Voice Activity Detection (VAD) distinguishes human speech from background
silence, enabling natural turn-taking and speech boundary detection.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
import math
import struct
import wave
import io


@dataclass
class VADResult:
    """Result of a Voice Activity Detection check."""

    is_speech: bool
    confidence: float
    duration_ms: float | None = None


class VADEngine(ABC):
    """Abstract base class for Voice Activity Detection engines."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Engine identifier, e.g. 'silero', 'energy'."""
        ...

    @abstractmethod
    def detect(self, audio_chunk: bytes, sample_rate: int = 16000) -> VADResult:
        """
        Check if an audio chunk contains speech.

        Args:
            audio_chunk: Raw audio bytes (PCM 16-bit or WAV).
            sample_rate: Audio sample rate in Hz.

        Returns:
            VADResult with speech detection outcome.
        """
        ...

    def reset(self) -> None:
        """Reset any internal state between sessions."""
        pass

    async def warmup(self) -> None:
        """Optional: pre-load model into memory."""
        pass

    async def shutdown(self) -> None:
        """Optional: release model resources."""
        pass


class EnergyVADEngine(VADEngine):
    """
    High-speed, zero-dependency RMS energy threshold VAD.
    Works on 16-bit PCM or WAV audio bytes.
    """

    def __init__(self, energy_threshold: float = 300.0) -> None:
        self.energy_threshold = energy_threshold

    @property
    def name(self) -> str:
        return "energy"

    def _extract_pcm(self, audio_bytes: bytes) -> tuple[bytes, int]:
        """Strip WAV header if present, returning (pcm_bytes, sample_rate)."""
        if audio_bytes.startswith(b"RIFF") and b"WAVE" in audio_bytes[:16]:
            try:
                with wave.open(io.BytesIO(audio_bytes), "rb") as wf:
                    sr = wf.getframerate()
                    frames = wf.readframes(wf.getnframes())
                    return frames, sr
            except Exception:
                pass
        return audio_bytes, 16000

    def detect(self, audio_chunk: bytes, sample_rate: int = 16000) -> VADResult:
        if not audio_chunk or len(audio_chunk) < 4:
            return VADResult(is_speech=False, confidence=0.0, duration_ms=0.0)

        pcm_data, sr = self._extract_pcm(audio_chunk)
        num_samples = len(pcm_data) // 2

        if num_samples == 0:
            return VADResult(is_speech=False, confidence=0.0, duration_ms=0.0)

        duration_ms = (num_samples / sr) * 1000.0

        # Calculate Root Mean Square (RMS)
        try:
            # Unpack 16-bit signed integers (little-endian)
            samples = struct.unpack(f"<{num_samples}h", pcm_data[: num_samples * 2])
            sum_sq = sum(s * s for s in samples)
            rms = math.sqrt(sum_sq / num_samples)
        except Exception:
            rms = 0.0

        is_speech = rms >= self.energy_threshold
        confidence = min(1.0, rms / (self.energy_threshold * 2.5)) if is_speech else max(0.0, rms / self.energy_threshold * 0.5)

        return VADResult(
            is_speech=is_speech,
            confidence=round(confidence, 3),
            duration_ms=round(duration_ms, 1),
        )


class SileroVADEngine(VADEngine):
    """
    Silero VAD adapter with fallback to energy-based VAD.
    """

    def __init__(self, threshold: float = 0.5) -> None:
        self.threshold = threshold
        self._fallback = EnergyVADEngine()
        self._model = None

    @property
    def name(self) -> str:
        return "silero"

    async def warmup(self) -> None:
        try:
            import torch

            model, _ = torch.hub.load(
                repo_or_dir="snakers4/silero-vad",
                model="silero_vad",
                force_reload=False,
                trust_repo=True,
            )
            self._model = model
            print("[VoiceFlow VAD] Silero VAD model loaded successfully.")
        except Exception as err:
            print(f"[VoiceFlow VAD] Note: Using EnergyVAD fallback ({err})")

    def detect(self, audio_chunk: bytes, sample_rate: int = 16000) -> VADResult:
        # If torch Silero is available, run inference; otherwise use EnergyVAD
        if self._model is not None:
            try:
                import torch
                pcm_data, sr = self._fallback._extract_pcm(audio_chunk)
                num_samples = len(pcm_data) // 2
                samples = struct.unpack(f"<{num_samples}h", pcm_data[: num_samples * 2])
                audio_float = torch.tensor(samples, dtype=torch.float32) / 32768.0
                speech_prob = self._model(audio_float, sr).item()
                duration_ms = (num_samples / sr) * 1000.0
                return VADResult(
                    is_speech=speech_prob >= self.threshold,
                    confidence=round(speech_prob, 3),
                    duration_ms=round(duration_ms, 1),
                )
            except Exception:
                pass

        return self._fallback.detect(audio_chunk, sample_rate)


_vad_instance: VADEngine | None = None


def get_vad_engine(name: str = "energy") -> VADEngine:
    global _vad_instance
    if _vad_instance is None:
        if name.lower() == "silero":
            _vad_instance = SileroVADEngine()
        else:
            _vad_instance = EnergyVADEngine()
    return _vad_instance
