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


class ChatStreamApiTests(TestCase):
    def _consume(self, resp):
        return b"".join(resp.streaming_content).decode()

    def test_stream_emits_deltas_and_done_with_full_answer(self):
        resp = self.client.post(
            reverse("api_chat_stream"),
            data=json.dumps({"prompt": "Hello", "provider": "mock", "model": "mock-smart"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp["Content-Type"], "text/event-stream")
        body = self._consume(resp)
        frames = [json.loads(line[5:].strip())
                  for line in body.split("\n\n") if line.strip().startswith("data:")]
        self.assertTrue(any("delta" in f for f in frames))
        done = [f for f in frames if f.get("done")]
        self.assertEqual(len(done), 1)
        self.assertIn("Hello", done[0]["answer"])
        self.assertEqual(done[0]["provider"], "mock")

    def test_stream_persists_history(self):
        resp = self.client.post(
            reverse("api_chat_stream"),
            data=json.dumps({"prompt": "first", "provider": "mock"}),
            content_type="application/json",
        )
        self._consume(resp)  # history is saved at the end of the stream
        self.assertIn("chat_history", self.client.session)
        self.assertEqual(len(self.client.session["chat_history"]), 2)

    def test_stream_rejects_empty_prompt_before_streaming(self):
        resp = self.client.post(
            reverse("api_chat_stream"),
            data=json.dumps({"prompt": "  "}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)


class CompareApiTests(TestCase):
    def test_compare_returns_one_result_per_target_in_order(self):
        resp = self.client.post(
            reverse("api_compare"),
            data=json.dumps({
                "prompt": "Hello",
                "targets": [
                    {"provider": "mock", "model": "mock-fast"},
                    {"provider": "mock", "model": "mock-smart"},
                ],
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        results = resp.json()["results"]
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["model"], "mock-fast")
        self.assertEqual(results[1]["model"], "mock-smart")
        self.assertIsNone(results[0]["error"])
        self.assertIn("latency_ms", results[0])

    def test_compare_requires_targets(self):
        resp = self.client.post(
            reverse("api_compare"),
            data=json.dumps({"prompt": "Hi", "targets": []}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_compare_rejects_too_many_targets(self):
        targets = [{"provider": "mock", "model": "mock-fast"} for _ in range(7)]
        resp = self.client.post(
            reverse("api_compare"),
            data=json.dumps({"prompt": "Hi", "targets": targets}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_compare_reports_error_per_target_without_failing_whole_request(self):
        resp = self.client.post(
            reverse("api_compare"),
            data=json.dumps({
                "prompt": "Hi",
                "targets": [{"provider": "does-not-exist", "model": "x"}],
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        results = resp.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertIsNotNone(results[0]["error"])


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
                model["path"].startswith("/static/scene/assets/"),
                model["path"],
            )

    def test_default_key_is_valid(self):
        keys = {m["key"] for m in discover_models()}
        if keys:
            self.assertIn(get_default_model_key(), keys)

    def test_angelica_is_female(self):
        models = {m["key"]: m for m in discover_models()}
        self.assertEqual(models["angelica"]["gender"], "female")

    def test_iasonas_alias_present_male_and_reuses_wraith_mesh(self):
        models = {m["key"]: m for m in discover_models()}
        self.assertIn("iasonas", models)
        self.assertEqual(models["iasonas"]["gender"], "male")
        # Placeholder mesh borrows wraith's path until a real asset is added.
        self.assertEqual(models["iasonas"]["path"], models["wraith"]["path"])
