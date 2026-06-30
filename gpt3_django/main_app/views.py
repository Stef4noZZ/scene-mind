import json
import time
from concurrent.futures import ThreadPoolExecutor

from django.conf import settings
from django.contrib import messages
from django.http import JsonResponse
from django.shortcuts import render
from django.utils.safestring import mark_safe
from django.views.decorators.http import require_GET, require_POST

from ai.providers.base import Message, ProviderError
from ai.registry import get_registry
from ai.service import chat as ai_chat
from viewer.model_viewer import get_models, get_default_model_key

from .forms import QuestionForm

SESSION_HISTORY_KEY = "chat_history"
MAX_COMPARE_TARGETS = 6


def _viewer_context():
    models = get_models()
    return {
        "models": models,
        "models_json": mark_safe(json.dumps(models)),
        "default_model": get_default_model_key(),
    }


def _catalog_context():
    catalog = get_registry().catalog()
    return {
        "catalog": catalog,
        "catalog_json": mark_safe(json.dumps(catalog)),
    }


def index(request):
    """Render the app shell. Chat itself happens over the JSON API below."""
    context = {"form": QuestionForm()}
    context.update(_viewer_context())
    context.update(_catalog_context())
    return render(request, "index.html", context)


@require_GET
def api_catalog(request):
    """Expose the provider/model catalog so the UI can populate its menus."""
    return JsonResponse(get_registry().catalog())


def _load_history(request):
    raw = request.session.get(SESSION_HISTORY_KEY, [])
    return [Message(turn["role"], turn["content"]) for turn in raw]


def _save_history(request, history):
    limit = getattr(settings, "AI_HISTORY_TURNS", 6) * 2  # user+assistant per turn
    trimmed = history[-limit:]
    request.session[SESSION_HISTORY_KEY] = [
        {"role": m.role, "content": m.content} for m in trimmed
    ]


@require_POST
def api_chat(request):
    """Stateless-looking chat endpoint backed by session history.

    Body: {"prompt": str, "provider": str?, "model": str?, "reset": bool?}
    """
    try:
        payload = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body."}, status=400)

    if payload.get("reset"):
        request.session.pop(SESSION_HISTORY_KEY, None)
        if not (payload.get("prompt") or "").strip():
            return JsonResponse({"reset": True})

    prompt = (payload.get("prompt") or "").strip()
    if not prompt:
        return JsonResponse({"error": "Please enter a question."}, status=400)
    if len(prompt) > 4000:
        return JsonResponse({"error": "Question is too long (max 4000 chars)."}, status=400)

    history = _load_history(request)

    try:
        result = ai_chat(
            prompt=prompt,
            provider_id=payload.get("provider"),
            model=payload.get("model"),
            history=history,
            system_prompt=getattr(settings, "AI_SYSTEM_PROMPT", None),
        )
    except ProviderError as exc:
        return JsonResponse({"error": str(exc)}, status=502)

    history.append(Message("user", prompt))
    history.append(Message("assistant", result["answer"]))
    _save_history(request, history)

    return JsonResponse(result)


@require_POST
def api_compare(request):
    """Run one prompt across several provider/model targets concurrently.

    Body: {"prompt": str, "targets": [{"provider": str, "model": str}, ...]}
    Each target is a fresh single-turn call (no shared history) so the
    comparison is fair. Results preserve the requested order.
    """
    try:
        payload = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body."}, status=400)

    prompt = (payload.get("prompt") or "").strip()
    if not prompt:
        return JsonResponse({"error": "Please enter a question."}, status=400)
    if len(prompt) > 4000:
        return JsonResponse({"error": "Question is too long (max 4000 chars)."}, status=400)

    targets = payload.get("targets")
    if not isinstance(targets, list) or not targets:
        return JsonResponse(
            {"error": "Select at least one provider/model to compare."}, status=400
        )
    if len(targets) > MAX_COMPARE_TARGETS:
        return JsonResponse(
            {"error": f"Too many targets (max {MAX_COMPARE_TARGETS})."}, status=400
        )

    system_prompt = getattr(settings, "AI_SYSTEM_PROMPT", None)

    def run_one(target):
        provider_id = (target or {}).get("provider")
        model = (target or {}).get("model")
        started = time.monotonic()
        try:
            result = ai_chat(
                prompt=prompt,
                provider_id=provider_id,
                model=model,
                history=None,
                system_prompt=system_prompt,
            )
            answer, error = result["answer"], None
            provider_id, model = result["provider"], result["model"]
        except ProviderError as exc:
            answer, error = None, str(exc)
        return {
            "provider": provider_id,
            "model": model,
            "answer": answer,
            "error": error,
            "latency_ms": int((time.monotonic() - started) * 1000),
        }

    with ThreadPoolExecutor(max_workers=min(len(targets), MAX_COMPARE_TARGETS)) as pool:
        results = list(pool.map(run_one, targets))

    return JsonResponse({"results": results})
