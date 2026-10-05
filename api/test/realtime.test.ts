import { describe, it, expect, beforeEach } from "vitest";
import { SentenceChunker } from "../src/realtime/sentenceChunker.js";
import type {
  RealtimeEvent,
  SessionStartEvent,
  SessionReadyEvent,
  AudioChunkEvent,
  SpeechStartedEvent,
  SpeechEndedEvent,
  TranscriptPartialEvent,
  TranscriptFinalEvent,
  AgentThinkingEvent,
  ResponseTextDeltaEvent,
  ResponseAudioChunkEvent,
  ResponseDoneEvent,
  AgentInterruptedEvent,
  SessionEndEvent,
  RealtimeErrorEvent,
} from "@voiceflow/shared";

describe("Phase 5: Real-Time Streaming Voice Test Suite", () => {
  // ─── 1. SentenceChunker Unit Tests ──────────────────────────────────────────
  describe("SentenceChunker", () => {
    let chunker: SentenceChunker;

    beforeEach(() => {
      chunker = new SentenceChunker(15);
    });

    it("emits complete sentence when period followed by space is fed", () => {
      const tokens = ["Hello ", "there, ", "how ", "can ", "I ", "help ", "you ", "today? ", "I ", "am "];
      const emitted: string[] = [];

      for (const token of tokens) {
        const sentences = chunker.addToken(token);
        emitted.push(...sentences);
      }

      expect(emitted.length).toBe(1);
      expect(emitted[0]).toBe("Hello there, how can I help you today?");
      expect(chunker.flush()).toBe("I am");
    });

    it("handles multiple sentence-ending punctuation (! and ?)", () => {
      const text1 = "Welcome to our AI service! ";
      const text2 = "Would you like to hear about our pricing plans? ";

      const emitted1 = chunker.addToken(text1);
      const emitted2 = chunker.addToken(text2);

      expect(emitted1).toEqual(["Welcome to our AI service!"]);
      expect(emitted2).toEqual(["Would you like to hear about our pricing plans?"]);
      expect(chunker.flush()).toBeNull();
    });

    it("does not split on abbreviations like Dr., Mr., etc.", () => {
      const input = "Please schedule an appointment with Dr. Smith tomorrow afternoon. ";
      const emitted = chunker.addToken(input);

      expect(emitted.length).toBe(1);
      expect(emitted[0]).toBe("Please schedule an appointment with Dr. Smith tomorrow afternoon.");
    });

    it("does not split on decimal numbers like 3.14 or $99.99", () => {
      const input = "The value of pi is approximately 3.14 in mathematics. ";
      const emitted = chunker.addToken(input);

      expect(emitted.length).toBe(1);
      expect(emitted[0]).toBe("The value of pi is approximately 3.14 in mathematics.");
    });

    it("merges sentences shorter than minSentenceLength with next sentence", () => {
      // "Hi. " is only 3 chars, below minSentenceLength 15
      const shortInput = "Hi. ";
      const emitted1 = chunker.addToken(shortInput);
      expect(emitted1.length).toBe(0); // Should buffer, not emit

      // Next sentence makes it long enough
      const followUp = "How can I assist you today with your voice configuration? ";
      const emitted2 = chunker.addToken(followUp);
      expect(emitted2.length).toBe(1);
      expect(emitted2[0]).toContain("Hi.");
      expect(emitted2[0]).toContain("How can I assist you today");
    });

    it("flushes remaining text when stream ends", () => {
      chunker.addToken("This is an incomplete thought without end punctuation");
      const flushed = chunker.flush();

      expect(flushed).toBe("This is an incomplete thought without end punctuation");
      expect(chunker.flush()).toBeNull();
    });

    it("splits on newline-separated sentences", () => {
      const input = "Here is the first item on the list.\nHere is the second item.\n";
      const emitted = chunker.addToken(input);

      expect(emitted.length).toBeGreaterThanOrEqual(1);
      expect(emitted[0]).toContain("first item");
    });

    it("resets internal buffer cleanly", () => {
      chunker.addToken("Some buffered text that will be cancelled.");
      chunker.reset();
      expect(chunker.flush()).toBeNull();
    });

    it("simulates streaming token-by-token generation from LLM", () => {
      const fullResponse = "Thank you for reaching out to VoiceFlow support. We are happy to help. Let us know what you need.";
      const tokenStream = fullResponse.split(" ");
      const allEmitted: string[] = [];

      for (let i = 0; i < tokenStream.length; i++) {
        const token = tokenStream[i] + (i < tokenStream.length - 1 ? " " : "");
        const res = chunker.addToken(token);
        allEmitted.push(...res);
      }

      const finalFlush = chunker.flush();
      if (finalFlush) {
        allEmitted.push(finalFlush);
      }

      expect(allEmitted.length).toBe(3);
      expect(allEmitted[0]).toBe("Thank you for reaching out to VoiceFlow support.");
      expect(allEmitted[1]).toBe("We are happy to help.");
      expect(allEmitted[2]).toBe("Let us know what you need.");
    });
  });

  // ─── 2. Realtime Event Protocol Typing & Serialization ─────────────────────
  describe("Realtime Event Protocol (13 Event Types)", () => {
    it("serializes and deserializes session.start correctly", () => {
      const event: SessionStartEvent = {
        type: "session.start",
        agentId: "agent-123",
        conversationId: "conv-456",
        config: {
          sampleRate: 16000,
          chunkDurationMs: 250,
          language: "en",
          voice: "en-US-AriaNeural",
        },
      };

      const json = JSON.stringify(event);
      const parsed = JSON.parse(json) as RealtimeEvent;

      expect(parsed.type).toBe("session.start");
      if (parsed.type === "session.start") {
        expect(parsed.agentId).toBe("agent-123");
        expect(parsed.config?.chunkDurationMs).toBe(250);
      }
    });

    it("serializes and deserializes session.ready correctly", () => {
      const event: SessionReadyEvent = {
        type: "session.ready",
        sessionId: "sess-abc",
        config: {
          sampleRate: 16000,
          chunkDurationMs: 250,
          language: "en",
          voice: "en-US-AriaNeural",
        },
      };

      const parsed = JSON.parse(JSON.stringify(event)) as SessionReadyEvent;
      expect(parsed.type).toBe("session.ready");
      expect(parsed.sessionId).toBe("sess-abc");
    });

    it("serializes and deserializes audio.chunk events", () => {
      const mockB64 = Buffer.from("audio-pcm-sample").toString("base64");
      const event: AudioChunkEvent = {
        type: "audio.chunk",
        data: mockB64,
        seq: 42,
        sampleRate: 16000,
      };

      const parsed = JSON.parse(JSON.stringify(event)) as AudioChunkEvent;
      expect(parsed.type).toBe("audio.chunk");
      expect(parsed.seq).toBe(42);
      expect(parsed.data).toBe(mockB64);
    });

    it("handles speech detection events (speech.started / speech.ended)", () => {
      const started: SpeechStartedEvent = {
        type: "speech.started",
        timestamp: 1726000000000,
      };
      const ended: SpeechEndedEvent = {
        type: "speech.ended",
        durationMs: 1450,
      };

      expect(started.type).toBe("speech.started");
      expect(ended.type).toBe("speech.ended");
      expect(ended.durationMs).toBe(1450);
    });

    it("handles transcript events (partial and final)", () => {
      const partial: TranscriptPartialEvent = {
        type: "transcript.partial",
        text: "I want to",
        confidence: 0.85,
      };
      const finalEvt: TranscriptFinalEvent = {
        type: "transcript.final",
        text: "I want to upgrade my account.",
        language: "en",
        confidence: 0.98,
      };

      expect(partial.type).toBe("transcript.partial");
      expect(partial.text).toBe("I want to");
      expect(finalEvt.type).toBe("transcript.final");
      expect(finalEvt.text).toBe("I want to upgrade my account.");
    });

    it("handles agent reasoning and streaming events", () => {
      const thinking: AgentThinkingEvent = {
        type: "agent.thinking",
        query: "What is your return policy?",
      };
      const delta: ResponseTextDeltaEvent = {
        type: "response.text.delta",
        text: " We offer a 30-day",
        isFinal: false,
      };
      const audioChunk: ResponseAudioChunkEvent = {
        type: "response.audio.chunk",
        data: "base64audio...",
        seq: 1,
        format: "audio/mp3",
      };

      expect(thinking.type).toBe("agent.thinking");
      expect(delta.type).toBe("response.text.delta");
      expect(audioChunk.type).toBe("response.audio.chunk");
      expect(audioChunk.seq).toBe(1);
    });

    it("handles response.done with complete latency breakdown", () => {
      const done: ResponseDoneEvent = {
        type: "response.done",
        messageId: "msg-999",
        latencies: {
          vadMs: 45,
          sttMs: 210,
          llmMs: 380,
          ttsMs: 190,
          totalMs: 825,
          timeToFirstAudioMs: 580,
        },
      };

      expect(done.type).toBe("response.done");
      expect(done.latencies.totalMs).toBe(825);
      expect(done.latencies.timeToFirstAudioMs).toBe(580);
    });

    it("handles agent.interrupted (barge-in event)", () => {
      const interrupt: AgentInterruptedEvent = {
        type: "agent.interrupted",
        reason: "user_barge_in",
      };

      expect(interrupt.type).toBe("agent.interrupted");
      expect(interrupt.reason).toBe("user_barge_in");
    });

    it("handles session.end and error events", () => {
      const end: SessionEndEvent = {
        type: "session.end",
        reason: "client_closed",
      };
      const error: RealtimeErrorEvent = {
        type: "error",
        code: "AGENT_NOT_FOUND",
        message: "The requested agent does not exist.",
      };

      expect(end.type).toBe("session.end");
      expect(error.type).toBe("error");
      expect(error.code).toBe("AGENT_NOT_FOUND");
    });
  });
});
