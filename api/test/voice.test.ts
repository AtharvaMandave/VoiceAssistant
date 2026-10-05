import { describe, it, expect } from "vitest";
import {
  VoiceTurnSchema,
  SynthesizeSpeechSchema,
} from "@voiceflow/shared";
import { voiceService } from "../src/services/voice/voiceService.js";

describe("Phase 4: Basic Voice Pipeline Test Suite", () => {
  // ─── 1. Schema Validation Tests ───────────────────────────────────────────
  describe("Zod Voice Schemas", () => {
    it("validates a well-formed VoiceTurnRequest", () => {
      const payload = {
        audioBase64: Buffer.from("mock-audio-data").toString("base64"),
        audioFormat: "audio/webm",
        mimeType: "audio/webm;codecs=opus",
        language: "en",
      };
      const result = VoiceTurnSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe("en");
        expect(result.data.audioFormat).toBe("audio/webm");
      }
    });

    it("rejects an empty audioBase64 string in VoiceTurnSchema", () => {
      const payload = {
        audioBase64: "",
      };
      const result = VoiceTurnSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("validates and defaults SynthesizeSpeechSchema fields", () => {
      const payload = {
        text: "Thank you for contacting VoiceFlow support.",
      };
      const result = SynthesizeSpeechSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.voice).toBe("en-US-AriaNeural");
        expect(result.data.speed).toBe(1.0);
        expect(result.data.pitch).toBe(1.0);
      }
    });

    it("rejects an empty text in SynthesizeSpeechSchema", () => {
      const payload = { text: "" };
      const result = SynthesizeSpeechSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  // ─── 2. Voice Service Unit Tests ──────────────────────────────────────────
  describe.sequential("VoiceService Operations", () => {
    it("lists available voices with default Aria voice", async () => {
      const voices = await voiceService.listVoices();
      expect(Array.isArray(voices)).toBe(true);
      expect(voices.length).toBeGreaterThan(0);
      expect(voices.some((v) => v.includes("Aria"))).toBe(true);
    });

    it("synthesizes speech and returns valid base64 audio and latency metrics", async () => {
      const { result, latencyMs } = await voiceService.synthesizeSpeech({
        text: "Hello, this is a test of voice synthesis.",
        voice: "en-US-AriaNeural",
      });

      expect(result.audioBase64).toBeDefined();
      expect(result.audioBase64.length).toBeGreaterThan(50);
      expect(["audio/mp3", "audio/wav"]).toContain(result.format);
      expect(latencyMs).toBeGreaterThan(0);
    }, 15000);

    it("transcribes audio and returns transcription result with latency", async () => {
      const mockB64 = Buffer.from("RIFF....WAVEfmt ....data....").toString("base64");
      const { result, latencyMs } = await voiceService.transcribeAudio({
        audioBase64: mockB64,
        filename: "test.wav",
        mimeType: "audio/wav",
      });

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
      expect(latencyMs).toBeGreaterThan(0);
    }, 25000);

    it("detects voice activity", async () => {
      const mockB64 = Buffer.from("audio-bytes").toString("base64");
      const vad = await voiceService.detectVAD(mockB64);
      expect(typeof vad.isSpeech).toBe("boolean");
      expect(typeof vad.confidence).toBe("number");
    }, 15000);
  });
});
