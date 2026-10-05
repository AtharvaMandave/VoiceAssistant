"""
VoiceFlow AI — LLM Engine Interface

Abstract Large Language Model engine. All LLM adapters (OpenAI,
self-hosted models, etc.) must implement this interface.
"""

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field


@dataclass
class LLMMessage:
    """A single message in the conversation."""

    role: str  # "system", "user", "assistant", "tool"
    content: str
    tool_call_id: str | None = None
    tool_calls: list[dict[str, object]] | None = None


@dataclass
class LLMGenerateOptions:
    """Options for LLM generation."""

    temperature: float = 0.7
    max_tokens: int = 1024
    top_p: float = 0.95
    stop_sequences: list[str] = field(default_factory=list)
    tools: list[dict[str, object]] | None = None  # JSON schemas for function calling


@dataclass
class LLMResponse:
    """Response from an LLM generation call."""

    content: str
    finish_reason: str  # "stop", "length", "tool_calls"
    tool_calls: list[dict[str, object]] | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    model: str = ""
    latency_ms: float = 0


class LLMEngine(ABC):
    """Abstract base class for Large Language Model engines."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Engine identifier, e.g. 'openai', 'ollama'."""
        ...

    @abstractmethod
    async def generate(
        self,
        messages: list[LLMMessage],
        options: LLMGenerateOptions | None = None,
    ) -> LLMResponse:
        """
        Generate a complete response from a conversation history.

        Args:
            messages: Conversation messages.
            options: Generation parameters.

        Returns:
            LLMResponse with content, usage stats, and optional tool calls.
        """
        ...

    @abstractmethod
    async def generate_stream(
        self,
        messages: list[LLMMessage],
        options: LLMGenerateOptions | None = None,
    ) -> AsyncIterator[str]:
        """
        Stream response tokens from a conversation history.
        Yields text deltas as they're generated.
        """
        ...

    async def warmup(self) -> None:
        """Optional: pre-load model or establish connection."""
        pass

    async def shutdown(self) -> None:
        """Optional: release resources."""
        pass
