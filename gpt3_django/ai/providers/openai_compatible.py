"""A single provider implementation for every OpenAI-compatible API.

OpenAI, Google Gemini, Ollama, Groq and OpenRouter all speak the same
``/chat/completions`` shape, differing only by ``base_url`` and credentials.
One class therefore covers them all; concrete providers are just
configuration (see ``registry``).
"""
from __future__ import annotations

import socket
from dataclasses import dataclass, field
from typing import List, Optional
from urllib.parse import urlparse

from .base import (
    GenerationOptions,
    LLMProvider,
    Message,
    ModelInfo,
    ProviderError,
)


@dataclass
class OpenAICompatibleProvider(LLMProvider):
    """Talks to any OpenAI-compatible chat-completions endpoint.

    ``api_key`` may be empty for keyless local servers such as Ollama; in that
    case a placeholder is sent because the SDK requires a non-empty value.
    """

    id: str = "openai"
    label: str = "OpenAI"
    models: List[ModelInfo] = field(default_factory=list)
    default_model: Optional[str] = None
    api_key: str = ""
    base_url: Optional[str] = None
    requires_key: bool = True

    @property
    def available(self) -> bool:
        if not self.models:
            return False
        if self.requires_key:
            return bool(self.api_key)
        # Keyless local endpoint (e.g. Ollama): only "available" if the server
        # is actually listening, so the UI doesn't promise an unreachable provider.
        if self.base_url and _is_local_url(self.base_url):
            return _port_open(self.base_url)
        return True

    def _client(self):
        try:
            from openai import OpenAI
        except ImportError as exc:  # pragma: no cover - depends on environment
            raise ProviderError(
                "The 'openai' package is not installed. Run 'pip install -r requirements.txt'."
            ) from exc

        return OpenAI(
            api_key=self.api_key or "not-needed",
            base_url=self.base_url,
        )

    def generate(
        self,
        messages: List[Message],
        model: str,
        options: Optional[GenerationOptions] = None,
    ) -> str:
        if not self.available:
            raise ProviderError(
                f"Provider '{self.label}' is not configured. Add its API key to .env."
            )

        options = options or GenerationOptions()
        model = self.resolve_model(model)
        client = self._client()

        try:
            response = client.chat.completions.create(
                model=model,
                messages=[m.as_dict() for m in messages],
                max_tokens=options.max_tokens,
                temperature=options.temperature,
                top_p=options.top_p,
            )
        except Exception as exc:  # noqa: BLE001 - normalise every SDK/HTTP error
            raise ProviderError(self._user_safe_error(exc)) from exc

        choices = getattr(response, "choices", None)
        if not choices:
            raise ProviderError(f"Provider '{self.label}' returned no choices.")
        content = choices[0].message.content
        return (content or "").strip()

    @staticmethod
    def _user_safe_error(exc: Exception) -> str:
        text = str(exc)
        lowered = text.lower()
        if "api key" in lowered or "authentication" in lowered or "401" in lowered:
            return "Authentication failed. Check the provider's API key in .env."
        if "connection" in lowered or "connect" in lowered:
            return "Could not reach the provider. Is the endpoint/base URL reachable?"
        if "model" in lowered and "not" in lowered:
            return "The selected model is not available for this provider."
        return f"Provider request failed: {text}"


_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}


def _is_local_url(url: str) -> bool:
    return (urlparse(url).hostname or "") in _LOCAL_HOSTS


def _port_open(url: str, timeout: float = 0.3) -> bool:
    """Cheap reachability check for a local endpoint (TCP connect)."""
    parsed = urlparse(url)
    host = parsed.hostname or "localhost"
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False
