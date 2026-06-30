"""Builds and serves the catalog of available AI providers.

Providers are declared once below with curated model lists. Credentials and
base URLs come from configuration (Django settings, which read the environment),
so adding a key in ``.env`` is all it takes to light up a provider. The mock
provider is always available, guaranteeing the app works with zero config.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from .providers.base import LLMProvider, ModelInfo, ProviderError
from .providers.mock import MockProvider
from .providers.openai_compatible import OpenAICompatibleProvider


@dataclass(frozen=True)
class ProviderSpec:
    """Static description of a known OpenAI-compatible provider."""

    id: str
    label: str
    env_key: str            # env var holding the API key
    base_url: Optional[str] # None => the SDK default (OpenAI cloud)
    requires_key: bool
    models: List[ModelInfo]
    default_model: str


# Curated, OpenAI-compatible providers. Model ids are the vendor's API ids.
PROVIDER_SPECS: List[ProviderSpec] = [
    ProviderSpec(
        id="openai",
        label="OpenAI",
        env_key="OPENAI_API_KEY",
        base_url=None,
        requires_key=True,
        models=[
            ModelInfo("gpt-4o-mini", "GPT-4o mini", "Fast, low-cost, capable default."),
            ModelInfo("gpt-4o", "GPT-4o", "Flagship multimodal model."),
            ModelInfo("gpt-3.5-turbo", "GPT-3.5 Turbo", "Legacy, inexpensive."),
        ],
        default_model="gpt-4o-mini",
    ),
    ProviderSpec(
        id="gemini",
        label="Google Gemini (free tier)",
        env_key="GEMINI_API_KEY",
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        requires_key=True,
        models=[
            ModelInfo("gemini-1.5-flash", "Gemini 1.5 Flash", "Fast, free-tier friendly."),
            ModelInfo("gemini-1.5-pro", "Gemini 1.5 Pro", "Higher quality reasoning."),
        ],
        default_model="gemini-1.5-flash",
    ),
    ProviderSpec(
        id="ollama",
        label="Ollama (local)",
        env_key="OLLAMA_API_KEY",  # usually unused; kept for symmetry
        base_url="http://localhost:11434/v1",
        requires_key=False,
        models=[
            ModelInfo("llama3.2", "Llama 3.2", "Local, runs via Ollama. No key needed."),
            ModelInfo("qwen2.5", "Qwen 2.5", "Local, runs via Ollama. No key needed."),
        ],
        default_model="llama3.2",
    ),
]


class ProviderRegistry:
    """Holds the live set of providers and exposes a JSON-serialisable catalog."""

    def __init__(self, providers: List[LLMProvider], default_provider: Optional[str] = None):
        self._providers: Dict[str, LLMProvider] = {p.id: p for p in providers}
        self.default_provider = self._resolve_default(default_provider)

    def _resolve_default(self, requested: Optional[str]) -> str:
        available = [p.id for p in self._providers.values() if p.available]
        if requested and requested in self._providers and self._providers[requested].available:
            return requested
        if available:
            return available[0]
        # No provider is available; fall back to whatever exists (mock always does).
        return next(iter(self._providers), "mock")

    def get(self, provider_id: Optional[str]) -> LLMProvider:
        pid = provider_id or self.default_provider
        provider = self._providers.get(pid)
        if provider is None:
            raise ProviderError(f"Unknown provider '{provider_id}'.")
        return provider

    def catalog(self) -> Dict[str, object]:
        return {
            "default_provider": self.default_provider,
            "providers": [p.as_dict() for p in self._providers.values()],
        }


def build_registry(config: Dict[str, object]) -> ProviderRegistry:
    """Build a registry from a config mapping (typically ``settings.AI_CONFIG``).

    Expected keys:
      - ``keys``: dict of env var name -> value (api keys, possibly empty)
      - ``base_urls``: optional dict of provider id -> base url override
      - ``enabled``: optional set/list of provider ids to include (besides mock)
      - ``default_provider``: optional preferred default provider id
    """
    keys: Dict[str, str] = dict(config.get("keys") or {})
    base_urls: Dict[str, str] = dict(config.get("base_urls") or {})
    enabled = config.get("enabled")
    enabled_set = set(enabled) if enabled is not None else None

    providers: List[LLMProvider] = [MockProvider()]

    for spec in PROVIDER_SPECS:
        if enabled_set is not None and spec.id not in enabled_set:
            continue
        providers.append(
            OpenAICompatibleProvider(
                id=spec.id,
                label=spec.label,
                models=list(spec.models),
                default_model=spec.default_model,
                api_key=keys.get(spec.env_key, "") or "",
                base_url=base_urls.get(spec.id, spec.base_url),
                requires_key=spec.requires_key,
            )
        )

    return ProviderRegistry(providers, default_provider=config.get("default_provider"))


_registry: Optional[ProviderRegistry] = None


def get_registry() -> ProviderRegistry:
    """Return the process-wide registry, built lazily from Django settings."""
    global _registry
    if _registry is None:
        from django.conf import settings

        _registry = build_registry(getattr(settings, "AI_CONFIG", {}))
    return _registry


def reset_registry() -> None:
    """Drop the cached registry (used by tests after overriding settings)."""
    global _registry
    _registry = None
