"""
VoiceFlow AI — TTS Engine Implementations

Text-to-Speech (TTS) synthesizes conversational text into lifelike speech.
Supports Edge-TTS (high quality Microsoft Neural voices, 0 extra cost)
with a deterministic WAV generator fallback for offline testing.
"""

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
import io
import math
import struct
import wave


@dataclass
class TTSSettings:
    """Configuration for a TTS synthesis request."""

    speed: float = 1.0
    pitch: float = 1.0
    sample_rate: int = 24000
    format: str = "mp3"  # mp3, wav, pcm
    extra: dict[str, object] = field(default_factory=dict)


@dataclass
class TTSChunk:
    """A chunk of synthesized audio."""

    audio: bytes
    sample_rate: int
    is_final: bool = False


class TTSEngine(ABC):
    """Abstract base class for Text-to-Speech engines."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Engine identifier, e.g. 'edge-tts', 'kokoro', 'mock-tts'."""
        ...

    @property
    @abstractmethod
    def available_voices(self) -> list[str]:
        """List of available voice IDs for this engine."""
        ...

    @abstractmethod
    async def synthesize(
        self,
        text: str,
        voice: str,
        settings: TTSSettings | None = None,
    ) -> bytes:
        """Synthesize text to complete audio bytes."""
        ...

    @abstractmethod
    async def synthesize_stream(
        self,
        text: str,
        voice: str,
        settings: TTSSettings | None = None,
    ) -> AsyncIterator[TTSChunk]:
        """Synthesize text to audio as a stream of chunks."""
        ...

    async def warmup(self) -> None:
        pass

    async def shutdown(self) -> None:
        pass


class EdgeTTSEngine(TTSEngine):
    """
    Neural Text-to-Speech using edge-tts.
    High naturalness, low latency, 40+ languages and accents.
    """

    DEFAULT_VOICE = "en-US-AriaNeural"

    VOICES = [
        "en-US-AriaNeural",
        "en-US-GuyNeural",
        "en-US-JennyNeural",
        "en-US-ChristopherNeural",
        "en-US-EricNeural",
        "en-GB-SoniaNeural",
        "en-GB-RyanNeural",
        "en-IN-NeerjaNeural",
        "en-IN-PrabhatNeural",
    ]

    KOKORO_VOICES = {
        "af_heart": "en-US-AriaNeural",
        "af_nicole": "en-US-JennyNeural",
        "af_bella": "en-US-AnaNeural",
        "am_adam": "en-US-GuyNeural",
        "am_michael": "en-US-ChristopherNeural",
        "bf_emma": "en-GB-SoniaNeural",
        "bm_george": "en-GB-RyanNeural",
    }

    @property
    def name(self) -> str:
        return "edge-tts"

    @property
    def available_voices(self) -> list[str]:
        return self.VOICES + list(self.KOKORO_VOICES.keys())

    def _normalize_voice(self, voice: str) -> str:
        if not voice:
            return self.DEFAULT_VOICE
        if voice in self.KOKORO_VOICES:
            return self.KOKORO_VOICES[voice]
        for k, v in self.KOKORO_VOICES.items():
            if k in voice.lower():
                return v
        for v in self.VOICES:
            if voice.lower() in v.lower() or v.lower() in voice.lower():
                return v
        return self.DEFAULT_VOICE

    def _rate_to_str(self, speed: float) -> str:
        # edge-tts expects rate string like "+0%", "+20%", "-10%"
        pct = int(round((speed - 1.0) * 100))
        return f"{'+' if pct >= 0 else ''}{pct}%"

    def _pitch_to_str(self, pitch: float) -> str:
        # edge-tts expects pitch string like "+0Hz", "+20Hz", "-10Hz"
        # Support slider scale (-10 to 10 where 0 is default/neutral)
        if -10.0 <= pitch <= 10.0 and (pitch <= 0.4 or pitch > 1.5):
            hz = int(round(pitch * 5))
            return f"{'+' if hz >= 0 else ''}{hz}Hz"
        # Support multiplier scale (0.5 to 1.5 where 1.0 is default/neutral)
        hz = int(round((pitch - 1.0) * 50))
        return f"{'+' if hz >= 0 else ''}{hz}Hz"

    async def synthesize(
        self,
        text: str,
        voice: str,
        settings: TTSSettings | None = None,
    ) -> bytes:
        import edge_tts

        norm_voice = self._normalize_voice(voice)
        speed = settings.speed if settings else 1.0
        pitch = settings.pitch if settings else 1.0

        communicate = edge_tts.Communicate(
            text=text,
            voice=norm_voice,
            rate=self._rate_to_str(speed),
            pitch=self._pitch_to_str(pitch),
        )

        audio_buffer = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_buffer.extend(chunk["data"])

        return bytes(audio_buffer)

    async def synthesize_stream(
        self,
        text: str,
        voice: str,
        settings: TTSSettings | None = None,
    ) -> AsyncIterator[TTSChunk]:
        import edge_tts

        norm_voice = self._normalize_voice(voice)
        speed = settings.speed if settings else 1.0
        pitch = settings.pitch if settings else 1.0

        communicate = edge_tts.Communicate(
            text=text,
            voice=norm_voice,
            rate=self._rate_to_str(speed),
            pitch=self._pitch_to_str(pitch),
        )

        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                yield TTSChunk(
                    audio=chunk["data"],
                    sample_rate=settings.sample_rate if settings else 24000,
                    is_final=False,
                )
        yield TTSChunk(audio=b"", sample_rate=24000, is_final=True)


class KokoroTTSEngine(TTSEngine):
    """
    Local neural TTS using Kokoro-82M via kokoro-onnx.

    License: Apache 2.0 — fully safe for commercial SaaS.
    Runs entirely on-device (CPU ONNX Runtime), zero external API calls.
    Produces 24kHz mono WAV audio natively.
    """

    KOKORO_SAMPLE_RATE = 24000

    VOICES = [
        "af_heart",
        "af_nicole",
        "af_bella",
        "am_adam",
        "am_michael",
        "bf_emma",
        "bm_george",
        "hf_alpha",
        "hm_omega",
    ]

    def __init__(self) -> None:
        self._kokoro = None  # Lazy-loaded Kokoro instance
        self._model_dir: str | None = None

    def _find_model_dir(self) -> str:
        """Locate the models directory relative to the ai-server root."""
        import pathlib
        candidates = [
            pathlib.Path(__file__).resolve().parent.parent.parent / "models",
            pathlib.Path("apps/ai-server/models"),
            pathlib.Path("models"),
        ]
        for p in candidates:
            if (p / "kokoro-v1.0.onnx").exists() and (p / "voices-v1.0.bin").exists():
                return str(p)
        raise FileNotFoundError(
            "Kokoro model files not found. Expected kokoro-v1.0.onnx and "
            "voices-v1.0.bin in one of: " + ", ".join(str(c) for c in candidates)
        )

    def _get_kokoro(self):
        """Lazy-initialize the Kokoro ONNX model (heavy, ~300MB)."""
        if self._kokoro is not None:
            return self._kokoro

        from kokoro_onnx import Kokoro
        import os

        model_dir = self._find_model_dir()
        self._model_dir = model_dir

        model_path = os.path.join(model_dir, "kokoro-v1.0.onnx")
        voices_path = os.path.join(model_dir, "voices-v1.0.bin")

        print(f"[KokoroTTS] Loading model from {model_path}...")
        self._kokoro = Kokoro(model_path, voices_path)
        print(f"[KokoroTTS] Model loaded. Available voices: {self._kokoro.get_voices()}")
        return self._kokoro

    @property
    def name(self) -> str:
        return "kokoro"

    @property
    def available_voices(self) -> list[str]:
        if self._kokoro is not None:
            return self._kokoro.get_voices()
        return self.VOICES

    def _get_lang_for_voice(self, voice: str) -> str:
        """Determine phonemizer language code based on voice prefix."""
        if voice.startswith("bf_") or voice.startswith("bm_"):
            return "en-gb"
        if voice.startswith("jf_") or voice.startswith("jm_"):
            return "ja"
        if voice.startswith("zf_") or voice.startswith("zm_"):
            return "zh"
        if voice.startswith("ef_") or voice.startswith("em_"):
            return "es"
        if voice.startswith("ff_"):
            return "fr"
        if voice.startswith("hf_") or voice.startswith("hm_"):
            return "hi"
        if voice.startswith("if_") or voice.startswith("im_"):
            return "it"
        if voice.startswith("pf_") or voice.startswith("pm_"):
            return "pt"
        return "en-us"

    def _normalize_voice(self, voice: str) -> str:
        """Map incoming voice ID to a valid Kokoro voice name."""
        if not voice:
            return "af_heart"
        if self._kokoro is not None and voice in self._kokoro.get_voices():
            return voice
        if voice in self.VOICES:
            return voice
        lower = voice.lower()
        for v in self.VOICES:
            if v in lower:
                return v
        return "af_heart"

    def _numpy_to_wav(self, samples, sample_rate: int) -> bytes:
        """Convert numpy float32 array to WAV bytes."""
        import numpy as np

        samples = np.clip(samples, -1.0, 1.0)
        int16_data = (samples * 32767).astype(np.int16)

        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(int16_data.tobytes())
        return buffer.getvalue()

    async def synthesize(
        self,
        text: str,
        voice: str,
        settings: TTSSettings | None = None,
    ) -> bytes:
        kokoro = self._get_kokoro()
        norm_voice = self._normalize_voice(voice)
        speed = settings.speed if settings else 1.0
        lang = self._get_lang_for_voice(norm_voice)

        import asyncio
        loop = asyncio.get_event_loop()
        samples, sr = await loop.run_in_executor(
            None,
            lambda: kokoro.create(text, voice=norm_voice, speed=speed, lang=lang),
        )

        return self._numpy_to_wav(samples, sr)

    async def synthesize_stream(
        self,
        text: str,
        voice: str,
        settings: TTSSettings | None = None,
    ) -> AsyncIterator[TTSChunk]:
        kokoro = self._get_kokoro()
        norm_voice = self._normalize_voice(voice)
        speed = settings.speed if settings else 1.0
        lang = self._get_lang_for_voice(norm_voice)

        async for samples, sr in kokoro.create_stream(
            text, voice=norm_voice, speed=speed, lang=lang
        ):
            wav_bytes = self._numpy_to_wav(samples, sr)
            yield TTSChunk(
                audio=wav_bytes,
                sample_rate=sr,
                is_final=False,
            )
        yield TTSChunk(audio=b"", sample_rate=self.KOKORO_SAMPLE_RATE, is_final=True)

    async def warmup(self) -> None:
        """Pre-load the model and execute a lightweight dry-run to warm up ONNX session."""
        try:
            kokoro = self._get_kokoro()
            import asyncio
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: kokoro.create("Hello", voice="af_heart", speed=1.0, lang="en-us"),
            )
            print("[KokoroTTS] Warmup inference complete. Model primed for sub-2s requests.")
        except Exception as err:
            print(f"[KokoroTTS] Warmup failed: {err}")


class MockTTSEngine(TTSEngine):
    """
    Fallback deterministic TTS generating a valid playable PCM WAV file.
    Works completely offline with 0 dependencies.
    """

    @property
    def name(self) -> str:
        return "mock-tts"

    @property
    def available_voices(self) -> list[str]:
        return ["mock-voice-aria", "mock-voice-guy"]

    def _generate_sine_wav(self, duration_sec: float = 0.8, sample_rate: int = 16000) -> bytes:
        total_samples = int(duration_sec * sample_rate)
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wf:
            wf.setnchannels(1)  # Mono
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(sample_rate)
            # Generate a gentle two-tone chime (440Hz and 880Hz)
            frames = bytearray()
            for i in range(total_samples):
                t = i / sample_rate
                val = int(8000 * math.sin(2 * math.pi * 440 * t) * (1.0 - t / duration_sec))
                frames.extend(struct.pack("<h", max(-32767, min(32767, val))))
            wf.writeframes(bytes(frames))
        return buffer.getvalue()

    async def synthesize(
        self,
        text: str,
        voice: str,
        settings: TTSSettings | None = None,
    ) -> bytes:
        # Approximate duration from word count (roughly 0.3s per word, min 0.5s)
        words = len(text.split())
        duration = max(0.5, min(4.0, words * 0.25))
        return self._generate_sine_wav(duration_sec=duration)

    async def synthesize_stream(
        self,
        text: str,
        voice: str,
        settings: TTSSettings | None = None,
    ) -> AsyncIterator[TTSChunk]:
        data = await self.synthesize(text, voice, settings)
        yield TTSChunk(audio=data, sample_rate=16000, is_final=True)


class CompositeTTSEngine(TTSEngine):
    """
    Composite TTS engine with cascading fallback:
      1. Kokoro (Apache 2.0, local ONNX, commercially safe)
      2. Edge-TTS (high quality but not for commercial multi-tenant SaaS)
      3. MockTTSEngine (sine-wave fallback for offline/testing)
    """

    def __init__(self) -> None:
        self.kokoro = KokoroTTSEngine()
        self.edge = EdgeTTSEngine()
        self.mock = MockTTSEngine()

    @property
    def name(self) -> str:
        return "composite-tts"

    @property
    def available_voices(self) -> list[str]:
        return self.kokoro.available_voices

    async def warmup(self) -> None:
        await self.kokoro.warmup()

    async def synthesize(
        self,
        text: str,
        voice: str,
        settings: TTSSettings | None = None,
    ) -> bytes:
        # Try Kokoro first (commercially safe, local)
        try:
            result = await self.kokoro.synthesize(text, voice, settings)
            print(f"[TTS] Kokoro synthesized {len(result)} bytes")
            return result
        except Exception as err:
            print(f"[TTS] Kokoro failed ({err}), trying Edge-TTS...")

        # Fallback to Edge-TTS
        try:
            result = await self.edge.synthesize(text, voice, settings)
            print(f"[TTS] Edge-TTS synthesized {len(result)} bytes")
            return result
        except Exception as err:
            print(f"[TTS] Edge-TTS failed ({err}), using mock fallback...")

        # Final fallback: mock sine wave
        return await self.mock.synthesize(text, voice, settings)

    async def synthesize_stream(
        self,
        text: str,
        voice: str,
        settings: TTSSettings | None = None,
    ) -> AsyncIterator[TTSChunk]:
        # Try Kokoro first
        try:
            async for chunk in self.kokoro.synthesize_stream(text, voice, settings):
                yield chunk
            return
        except Exception as err:
            print(f"[TTS] Kokoro stream failed ({err}), trying Edge-TTS...")

        # Fallback to Edge-TTS
        try:
            async for chunk in self.edge.synthesize_stream(text, voice, settings):
                yield chunk
            return
        except Exception as err:
            print(f"[TTS] Edge-TTS stream failed ({err}), using mock fallback...")

        # Final fallback
        async for chunk in self.mock.synthesize_stream(text, voice, settings):
            yield chunk


_tts_instance: TTSEngine | None = None


def get_tts_engine() -> TTSEngine:
    global _tts_instance
    if _tts_instance is None:
        _tts_instance = CompositeTTSEngine()
    return _tts_instance
