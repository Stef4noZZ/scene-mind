"""A keyless provider used for zero-config demos and tests.

It never calls the network, so the whole app runs end to end without any API
key. Replies are deterministic and clearly labelled as mock output.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from .base import GenerationOptions, LLMProvider, Message, ModelInfo

_MODELS = [
    ModelInfo("mock-fast", "Mock Fast", "Instant canned reply. No network, no key."),
    ModelInfo("mock-smart", "Mock Smart", "Echoes your prompt with a short canned framing."),
]


@dataclass
class MockProvider(LLMProvider):
    id: str = "mock"
    label: str = "Mock (no key)"
    models: List[ModelInfo] = field(default_factory=lambda: list(_MODELS))
    default_model: Optional[str] = "mock-fast"

    @property
    def available(self) -> bool:
        return True

    def generate(
        self,
        messages: List[Message],
        model: str,
        options: Optional[GenerationOptions] = None,
    ) -> str:
        model = self.resolve_model(model)
        last_user = next(
            (m.content for m in reversed(messages) if m.role == "user"), ""
        )
        if model == "mock-smart":
            return (
                "[mock-smart] You asked: \"{q}\". This is a deterministic, keyless "
                "response from SceneMind's built-in mock provider — wire a real "
                "provider in .env for live answers."
            ).format(q=last_user.strip())
        return (
            "[mock-fast] SceneMind mock reply. Select a configured provider "
            "(OpenAI, Gemini, Ollama) to get real model output."
        )
