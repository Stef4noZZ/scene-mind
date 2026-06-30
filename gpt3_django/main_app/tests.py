import json

from django.test import TestCase
from django.urls import reverse

from viewer.model_viewer import discover_models, get_default_model_key


class CatalogApiTests(TestCase):
    def test_catalog_returns_providers(self):
        resp = self.client.get(reverse("api_catalog"))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("providers", data)
        self.assertIn("default_provider", data)
        ids = {p["id"] for p in data["providers"]}
        self.assertIn("mock", ids)


class ChatApiTests(TestCase):
    def test_chat_with_mock_provider_returns_answer(self):
        resp = self.client.post(
            reverse("api_chat"),
            data=json.dumps({"prompt": "Hello", "provider": "mock", "model": "mock-smart"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["provider"], "mock")
        self.assertIn("Hello", data["answer"])

    def test_empty_prompt_is_rejected(self):
        resp = self.client.post(
            reverse("api_chat"),
            data=json.dumps({"prompt": "   "}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_invalid_json_is_rejected(self):
        resp = self.client.post(
            reverse("api_chat"), data="not json", content_type="application/json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_history_is_persisted_in_session(self):
        self.client.post(
            reverse("api_chat"),
            data=json.dumps({"prompt": "first", "provider": "mock"}),
            content_type="application/json",
        )
        self.assertIn("chat_history", self.client.session)
        self.assertEqual(len(self.client.session["chat_history"]), 2)  # user + assistant

    def test_reset_clears_history(self):
        self.client.post(
            reverse("api_chat"),
            data=json.dumps({"prompt": "first", "provider": "mock"}),
            content_type="application/json",
        )
        resp = self.client.post(
            reverse("api_chat"),
            data=json.dumps({"reset": True, "prompt": ""}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn("chat_history", self.client.session)

    def test_get_not_allowed_on_chat(self):
        resp = self.client.get(reverse("api_chat"))
        self.assertEqual(resp.status_code, 405)


class IndexViewTests(TestCase):
    def test_index_renders(self):
        resp = self.client.get(reverse("index"))
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, "AI Assistant")
        self.assertContains(resp, "3D Model Explorer")


class ModelDiscoveryTests(TestCase):
    def test_discovers_known_models(self):
        keys = {m["key"] for m in discover_models()}
        self.assertIn("angelica", keys)

    def test_paths_are_static_urls(self):
        for model in discover_models():
            self.assertTrue(
                model["path"].startswith("/static/rendering_angelica/assets/"),
                model["path"],
            )

    def test_default_key_is_valid(self):
        keys = {m["key"] for m in discover_models()}
        if keys:
            self.assertIn(get_default_model_key(), keys)
