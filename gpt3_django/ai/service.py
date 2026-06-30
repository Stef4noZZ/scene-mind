"""High-level chat entry point used by views.

This is the only function the web layer needs: it resolves the provider and
model from the registry, runs the generation, and returns the reply. Errors are
raised as :class:`ProviderError` with user-safe messages.
"""
from __future__ import annotations

from typing import List, Optional

from .providers.base import GenerationOptions, Message, ProviderError
from .registry import get_registry

__all__ = ["chat", "chat_stream", "ProviderError", "Message"]


def _build_messages(prompt, history, system_prompt):
    messages: List[Message] = []
    if system_prompt:
        messages.append(Message("system", system_prompt))
    messages.extend(history or [])
    messages.append(Message("user", prompt))
    return messages


def chat(
    prompt: str,
    provider_id: Optional[str] = None,
    model: Optional[str] = None,
    history: Optional[List[Message]] = None,
    system_prompt: Optional[str] = None,
    options: Optional[GenerationOptions] = None,
) -> dict:
    """Generate a reply and report which provider/model actually served it."""
    prompt = (prompt or "").strip()
    if not prompt:
        raise ProviderError("Please enter a question.")

    registry = get_registry()
    provider = registry.get(provider_id)
    resolved_model = provider.resolve_model(model)

    messages = _build_messages(prompt, history, system_prompt)
    answer = provider.generate(messages, resolved_model, options)
    return {"answer": answer, "provider": provider.id, "model": resolved_model}


def chat_stream(
    prompt: str,
    provider_id: Optional[str] = None,
    model: Optional[str] = None,
    history: Optional[List[Message]] = None,
    system_prompt: Optional[str] = None,
    options: Optional[GenerationOptions] = None,
):
    """Resolve the provider/model and return ``(info, token_iterator)``.

    ``info`` is ``{"provider", "model"}`` known up front; ``token_iterator``
    yields reply chunks lazily (and may raise ProviderError mid-iteration).
    """
    prompt = (prompt or "").strip()
    if not prompt:
        raise ProviderError("Please enter a question.")

    registry = get_registry()
    provider = registry.get(provider_id)
    resolved_model = provider.resolve_model(model)
    messages = _build_messages(prompt, history, system_prompt)

    info = {"provider": provider.id, "model": resolved_model}

    def tokens():
        yield from provider.generate_stream(messages, resolved_model, options)

    return info, tokens()
