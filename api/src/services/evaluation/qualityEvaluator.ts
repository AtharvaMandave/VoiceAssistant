// ─── Quality & Sentiment Evaluation Service ─────────────────────────────────
// Analyzes conversation sessions for customer sentiment, frustration signals,
// escalation triggers, and performance latency.
// Based on PRD Sections 20 & 21: Quality Evaluation & Sentiment Analysis.
// ─────────────────────────────────────────────────────────────────────────────

import type { IConversationDocument } from "../../models/Conversation.js";
import type { IMessageDocument } from "../../models/Message.js";
import type { ConversationSentiment } from "@voiceflow/shared";

export interface EvaluationResult {
  sentiment: ConversationSentiment;
  sentimentScore: number; // -1.0 (strongly negative) to +1.0 (strongly positive)
  escalated: boolean;
  escalationReason?: string;
  avgLatencyMs: number;
  durationMs: number;
  positiveTriggers: string[];
  negativeTriggers: string[];
}

// ─── Trigger dictionaries ───────────────────────────────────────────────────

const POSITIVE_PATTERNS = [
  /\b(thank\s*you|thanks|thx|awesome|great|perfect|excellent|wonderful|helpful|appreciate|good\s*job|fantastic|amazing|resolved|solved)\b/i,
  /\b(very\s*good|super\s*helpful|you\s*helped\s*a\s*lot|works\s*now|exactly\s*what\s*i\s*needed)\b/i,
];

const NEGATIVE_PATTERNS = [
  /\b(terrible|horrible|useless|stupid|awful|worst|garbage|crap|broken|hate|angry|frustrated|annoying|unacceptable)\b/i,
  /\b(waste\s*of\s*time|doesn'?t\s*work|you\s*don'?t\s*understand|not\s*helping|stop\s*repeating|incompetent)\b/i,
  /\b(cancel\s*my|refund|file\s*a\s*complaint|lawyer|sue)\b/i,
];

const HUMAN_ESCALATION_PATTERNS = [
  /\b(human|person|agent|representative|operator|manager|supervisor|real\s*person|somebody\s*else)\b/i,
  /\b(talk\s*to\s*someone|speak\s*to\s*a\s*human|connect\s*me\s*to|transfer\s*me|let\s*me\s*talk\s*to)\b/i,
  /\b(give\s*me\s*a\s*human|i\s*want\s*a\s*person)\b/i,
];

/**
 * Evaluate conversation quality, sentiment, and escalation status.
 */
export function evaluateConversationTranscript(
  messages: IMessageDocument[],
  _conversation?: IConversationDocument
): EvaluationResult {
  if (messages.length === 0) {
    return {
      sentiment: "neutral",
      sentimentScore: 0,
      escalated: false,
      avgLatencyMs: 0,
      durationMs: 0,
      positiveTriggers: [],
      negativeTriggers: [],
    };
  }

  let positiveScore = 0;
  let negativeScore = 0;
  const positiveTriggers: string[] = [];
  const negativeTriggers: string[] = [];
  let escalationRequested = false;
  let escalationReason: string | undefined;

  let totalLatency = 0;
  let assistantTurnsWithLatency = 0;

  for (const msg of messages) {
    // Latency accumulation
    if (msg.role === "assistant" && typeof msg.latencyMs === "number" && msg.latencyMs > 0) {
      totalLatency += msg.latencyMs;
      assistantTurnsWithLatency++;
    }

    // Sentiment analysis on user turns
    if (msg.role === "user") {
      const text = msg.content;

      // Check human escalation
      for (const pattern of HUMAN_ESCALATION_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
          escalationRequested = true;
          escalationReason = `Customer requested human support ("${match[0]}")`;
          negativeScore += 0.5;
          break;
        }
      }

      // Check positive triggers
      for (const pattern of POSITIVE_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
          positiveScore += 0.4;
          if (!positiveTriggers.includes(match[0].toLowerCase())) {
            positiveTriggers.push(match[0].toLowerCase());
          }
        }
      }

      // Check negative triggers
      for (const pattern of NEGATIVE_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
          negativeScore += 0.6;
          if (!negativeTriggers.includes(match[0].toLowerCase())) {
            negativeTriggers.push(match[0].toLowerCase());
          }
        }
      }
    }
  }

  // Calculate net sentiment (-1.0 to 1.0)
  const rawScore = positiveScore - negativeScore;
  const clampedScore = Math.max(-1.0, Math.min(1.0, Number(rawScore.toFixed(2))));

  let sentiment: ConversationSentiment = "neutral";
  if (clampedScore > 0.2) {
    sentiment = "positive";
  } else if (clampedScore < -0.2) {
    sentiment = "negative";
  }

  // If heavy negative sentiment occurs, mark as escalated
  let escalated = escalationRequested;
  if (!escalated && clampedScore <= -0.5) {
    escalated = true;
    escalationReason = `High customer frustration detected (Sentiment score: ${clampedScore})`;
  }

  // Latency calculation
  const avgLatencyMs =
    assistantTurnsWithLatency > 0
      ? Math.round(totalLatency / assistantTurnsWithLatency)
      : 0;

  // Duration calculation from first message to last message
  const firstTimestamp = new Date(messages[0].createdAt).getTime();
  const lastTimestamp = new Date(messages[messages.length - 1].createdAt).getTime();
  const durationMs = Math.max(0, lastTimestamp - firstTimestamp);

  return {
    sentiment,
    sentimentScore: clampedScore,
    escalated,
    escalationReason,
    avgLatencyMs,
    durationMs,
    positiveTriggers,
    negativeTriggers,
  };
}
