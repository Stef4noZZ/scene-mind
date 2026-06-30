# SceneMind — Dynamic AI Assistant + 3D Viewer

SceneMind is a Django app that pairs a **provider-agnostic AI chat assistant**
with a local **Three.js 3D model viewer**. You pick the AI provider and model
from the UI; new 3D models are discovered automatically from disk.

It runs **with zero API keys** thanks to a built-in keyless mock provider — add
a real key in `.env` to light up OpenAI, Google Gemini, or a local Ollama.

## Highlights

- **Dynamic provider + model selection** — choose the provider, then its model,
  from dependent dropdowns. The menu is built from a live catalog API.
- **One client, many providers** — OpenAI, Gemini, Ollama (and any other
  OpenAI-compatible endpoint) are served through a single client configured by
  `base_url`. See [`ai/`](gpt3_django/ai/).
- **Keyless by default** — the `mock` provider always works, so the app and its
  tests run end-to-end with no credentials.
- **AJAX chat with session memory** — no full-page reloads; recent turns are
  remembered per session.
- **Talking + listening avatar** — replies are spoken aloud (text-to-speech)
  and a mic button accepts voice questions (speech-to-text), with the 3D model
  animating while it speaks. Uses the browser Web Speech API (no keys); best in
  Chrome/Edge, served over `localhost` or HTTPS for mic access.
- **Auto-discovered 3D models** — drop a folder with a `.gltf`/`.glb` under
  `static/rendering_angelica/assets/<name>/` and it appears in the viewer.
- **Tested** — provider registry, mock provider, API endpoints, and model
  discovery are covered by Django tests.

## Architecture

```
gpt3_django/
  ai/                      # provider-agnostic AI layer (no Django coupling)
    providers/
      base.py              # LLMProvider ABC, Message, ModelInfo, errors
      mock.py              # keyless echo provider (always available)
      openai_compatible.py # one client for OpenAI / Gemini / Ollama / ...
    registry.py            # builds the provider catalog from settings/env
    service.py             # chat() entry point used by views
  main_app/                # web layer: index page + JSON API
    views.py               # index, /api/catalog/, /api/chat/
  viewer/
    model_viewer.py        # filesystem auto-discovery of 3D models
  static/js/chat.js        # dependent dropdowns + AJAX chat client
```

The web layer never imports a vendor SDK directly — it only talks to
`ai.service.chat()` and `ai.registry`.

## API

| Method | Path             | Purpose                                          |
|--------|------------------|--------------------------------------------------|
| GET    | `/api/catalog/`  | Providers + models + which are available.        |
| POST   | `/api/chat/`     | `{prompt, provider?, model?, reset?}` → `{answer, provider, model}` |

## Setup

```bash
cp .env.example .env
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt

python gpt3_django/manage.py migrate
python gpt3_django/manage.py runserver
```

Open http://127.0.0.1:8000 — the **Mock** provider works immediately.

## Enabling real providers (all optional)

Add any of these to `.env`; the UI picks them up automatically on reload.

- **Google Gemini (free tier)** — get a key at https://aistudio.google.com/apikey
  ```env
  GEMINI_API_KEY=your-key
  AI_DEFAULT_PROVIDER=gemini
  ```
- **Ollama (local, no key)** — install from https://ollama.com, then `ollama pull llama3.2`.
  The default base URL is `http://localhost:11434/v1`.
- **OpenAI (paid)** — get a key at https://platform.openai.com/api-keys
  ```env
  OPENAI_API_KEY=sk-...
  ```

`AI_ENABLED_PROVIDERS` (comma-separated) can restrict which providers appear.
See [`.env.example`](.env.example) for all options.

## Tests

```bash
python gpt3_django/manage.py test
```

## Notes

- No API keys are stored in source control.
- In production (`DJANGO_DEBUG=False`) a real `DJANGO_SECRET_KEY` is required.
- The chat assistant and 3D viewer share one page.
