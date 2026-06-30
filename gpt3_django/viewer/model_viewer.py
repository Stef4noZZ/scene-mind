"""Dynamic 3D model discovery for the Three.js viewer.

Models are discovered by scanning the assets directory at request time: drop a
folder containing a ``.gltf``/``.glb`` under
``static/rendering_angelica/assets/<key>/`` and it shows up automatically.

Optional curated metadata (nicer labels, descriptions, ordering) can be layered
on top via :data:`MODEL_METADATA` without having to hardcode the full list.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, List, Optional

from django.conf import settings

# GLTFLoader resolves fetch URLs against the document (served at "/"), not the
# JS module, so model paths must be absolute static URLs
# ("/static/rendering_angelica/assets/<...>"), built from STATIC_URL.
_ASSETS_SUBDIR = Path("rendering_angelica") / "assets"
_MODEL_EXTENSIONS = (".gltf", ".glb")


def _web_prefix() -> str:
    static_url = getattr(settings, "STATIC_URL", "/static/") or "/static/"
    return f"{static_url.rstrip('/')}/rendering_angelica/assets"

# Optional polish layered on top of discovery. Keys that are not found on disk
# are simply ignored; folders not listed here still appear with a derived label.
MODEL_METADATA: Dict[str, Dict[str, str]] = {
    "angelica": {"label": "Angelica", "description": "The original Angelica 3D model."},
    "fem_head": {"label": "Fem Head", "description": "A detailed head model with an expressive face."},
    "fem_face": {"label": "Fem Face", "description": "A face study model with refined textures."},
    "wraith": {"label": "Wraith", "description": "A stylized wraith model with atmospheric details."},
}

# Preferred order; anything else is appended alphabetically after these.
PREFERRED_ORDER = ["angelica", "fem_head", "fem_face", "wraith"]

DEFAULT_MODEL_KEY = "angelica"


def _assets_root() -> Optional[Path]:
    for static_dir in getattr(settings, "STATICFILES_DIRS", []):
        candidate = Path(static_dir) / _ASSETS_SUBDIR
        if candidate.is_dir():
            return candidate
    return None


def _find_model_file(folder: Path) -> Optional[Path]:
    """Return the best model file inside ``folder`` (prefers .gltf over .glb)."""
    best: Optional[Path] = None
    for ext in _MODEL_EXTENSIONS:
        matches = sorted(folder.rglob(f"*{ext}"))
        if matches:
            best = matches[0]
            break
    return best


def _humanize(key: str) -> str:
    return key.replace("_", " ").replace("-", " ").title()


def _to_web_path(model_file: Path, assets_root: Path) -> str:
    rel = model_file.relative_to(assets_root).as_posix()
    return f"{_web_prefix()}/{rel}"


def discover_models() -> List[Dict[str, str]]:
    """Scan the assets directory and return a list of model descriptors."""
    assets_root = _assets_root()
    if assets_root is None:
        return []

    found: Dict[str, Dict[str, str]] = {}
    for entry in sorted(os.scandir(assets_root), key=lambda e: e.name):
        if not entry.is_dir():
            continue
        model_file = _find_model_file(Path(entry.path))
        if model_file is None:
            continue
        key = entry.name
        meta = MODEL_METADATA.get(key, {})
        found[key] = {
            "key": key,
            "label": meta.get("label", _humanize(key)),
            "path": _to_web_path(model_file, assets_root),
            "description": meta.get("description", ""),
        }

    ordered_keys = [k for k in PREFERRED_ORDER if k in found]
    ordered_keys += [k for k in sorted(found) if k not in ordered_keys]
    return [found[k] for k in ordered_keys]


def get_models() -> List[Dict[str, str]]:
    return discover_models()


def get_default_model_key() -> str:
    models = discover_models()
    keys = {m["key"] for m in models}
    if DEFAULT_MODEL_KEY in keys:
        return DEFAULT_MODEL_KEY
    return models[0]["key"] if models else DEFAULT_MODEL_KEY


# Backwards-compatible aliases (old import names).
get_model_viewer_models = get_models
get_default_model_viewer_key = get_default_model_key
