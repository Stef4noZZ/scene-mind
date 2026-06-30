"""Backwards-compatible shim.

The OpenAI-specific service was replaced by the provider-agnostic ``ai`` layer.
This thin wrapper keeps the old import path working and delegates to it.
Prefer importing from ``ai.service`` directly in new code.
"""
from __future__ import annotations

from typing import Optional

from ai.providers.base import GenerationOptions
from ai.service import chat


def ask_openai(prompt, model: Optional[str] = None, max_tokens: int = 250, temperature: float = 0.7) -> str:
    """Generate a reply using the OpenAI provider (legacy signature)."""
    result = chat(
        prompt=prompt,
        provider_id="openai",
        model=model,
        options=GenerationOptions(max_tokens=max_tokens, temperature=temperature),
    )
    return result["answer"]
