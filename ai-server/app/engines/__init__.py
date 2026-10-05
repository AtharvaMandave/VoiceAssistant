"""
VoiceFlow AI Server — Engine Interfaces

Abstract base classes for all AI/voice engine adapters.
The agent runtime depends on these interfaces, NEVER on concrete
model implementations. This allows model replacement, fallback,
and tenant-specific routing without touching business logic.
"""
