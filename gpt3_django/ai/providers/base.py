"""Base types shared by every AI provider."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, List, Optional


class ProviderError(Exception):
    """Raised when a provider cannot fulfil a request.

    The message is safe to surface to the end user (it never contains keys).
    """


@dataclass(frozen=True)
class Message:
    """A single chat turn."""

    role: str  # 'system' | 'user' | 'assistant'
    content: str

    def as_dict(self) -> Dict[str, str]:
        return {"role": self.role, "content": self.content}


@dataclass(frozen=True)
class ModelInfo:
    """A model a provider can serve."""

    id: str
    label: str
    description: str = ""

    def as_dict(self) -> Dict[str, str]:
        return {"id": self.id, "label": self.label, "description": self.description}


@dataclass
class GenerationOptions:
    """Tunable knobs applied to a generation request."""

    max_tokens: int = 512
    temperature: float = 0.7
    top_p: float = 1.0


@dataclass
class LLMProvider(ABC):
    """Abstract chat provider.

    Concrete providers declare their identity and the models they expose, and
    implement :meth:`generate`. Whether a provider is *usable* right now (for
    example, whether an API key is present) is reported by :attr:`available`.
    """

    id: str
    label: str
    models: List[ModelInfo] = field(default_factory=list)
    default_model: Optional[str] = None

    @property
    @abstractmethod
    def available(self) -> bool:
        """True when this provider is configured and ready to serve requests."""

    @abstractmethod
    def generate(
        self,
        messages: List[Message],
        model: str,
        options: Optional[GenerationOptions] = None,
    ) -> str:
        """Return the assistant reply for ``messages`` using ``model``.

        Raises :class:`ProviderError` on any failure, with a user-safe message.
        """

    def generate_stream(
        self,
        messages: List[Message],
        model: str,
        options: Optional[GenerationOptions] = None,
    ):
        """Yield the reply in chunks. Default: emit the full reply at once.

        Providers that support token streaming override this. Raises
        :class:`ProviderError` (possibly mid-iteration) with a user-safe message.
        """
        yield self.generate(messages, model, options)

    def resolve_model(self, model: Optional[str]) -> str:
        """Validate a requested model id, falling back to the default."""
        valid = {m.id for m in self.models}
        if model and model in valid:
            return model
        if self.default_model and self.default_model in valid:
            return self.default_model
        if self.models:
            return self.models[0].id
        raise ProviderError(f"Provider '{self.id}' has no models configured.")

    def as_dict(self) -> Dict[str, object]:
        return {
            "id": self.id,
            "label": self.label,
            "available": self.available,
            "default_model": self.resolve_model(None) if self.models else None,
            "models": [m.as_dict() for m in self.models],
        }
