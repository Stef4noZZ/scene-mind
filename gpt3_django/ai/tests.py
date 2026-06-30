from django.test import SimpleTestCase

from ai.providers.base import GenerationOptions, Message, ProviderError
from ai.providers.mock import MockProvider
from ai.providers.openai_compatible import OpenAICompatibleProvider
from ai.registry import ProviderRegistry, build_registry


class MockProviderTests(SimpleTestCase):
    def test_always_available(self):
        self.assertTrue(MockProvider().available)

    def test_echoes_user_prompt(self):
        provider = MockProvider()
        reply = provider.generate([Message("user", "Hello there")], "mock-smart")
        self.assertIn("Hello there", reply)

    def test_resolves_unknown_model_to_default(self):
        provider = MockProvider()
        self.assertEqual(provider.resolve_model("does-not-exist"), "mock-fast")


class OpenAICompatibleAvailabilityTests(SimpleTestCase):
    def test_requires_key_when_flagged(self):
        provider = OpenAICompatibleProvider(
            id="openai", label="OpenAI", models=MockProvider().models,
            default_model="mock-fast", api_key="", requires_key=True,
        )
        self.assertFalse(provider.available)

    def test_keyless_provider_available_with_models(self):
        provider = OpenAICompatibleProvider(
            id="ollama", label="Ollama", models=MockProvider().models,
            default_model="mock-fast", api_key="", requires_key=False,
        )
        self.assertTrue(provider.available)

    def test_keyless_local_provider_unavailable_when_port_closed(self):
        # Port 1 on localhost is virtually never listening -> unreachable.
        provider = OpenAICompatibleProvider(
            id="ollama", label="Ollama", models=MockProvider().models,
            default_model="mock-fast", api_key="", requires_key=False,
            base_url="http://localhost:1/v1",
        )
        self.assertFalse(provider.available)

    def test_generate_without_config_raises_user_safe_error(self):
        provider = OpenAICompatibleProvider(
            id="openai", label="OpenAI", models=MockProvider().models,
            default_model="mock-fast", api_key="", requires_key=True,
        )
        with self.assertRaises(ProviderError):
            provider.generate([Message("user", "hi")], "mock-fast", GenerationOptions())


class RegistryTests(SimpleTestCase):
    def test_mock_always_present_and_default_when_no_keys(self):
        registry = build_registry({"keys": {}, "default_provider": "mock"})
        catalog = registry.catalog()
        ids = {p["id"] for p in catalog["providers"]}
        self.assertIn("mock", ids)
        self.assertEqual(catalog["default_provider"], "mock")

    def test_key_makes_provider_available(self):
        registry = build_registry({"keys": {"OPENAI_API_KEY": "sk-test"}})
        openai = registry.get("openai")
        self.assertTrue(openai.available)

    def test_enabled_filter_restricts_providers(self):
        registry = build_registry({"keys": {}, "enabled": ["gemini"]})
        ids = {p["id"] for p in registry.catalog()["providers"]}
        self.assertEqual(ids, {"mock", "gemini"})

    def test_unknown_provider_raises(self):
        registry = build_registry({"keys": {}})
        with self.assertRaises(ProviderError):
            registry.get("nope")

    def test_default_falls_back_to_available_when_requested_unavailable(self):
        # Request openai as default but provide no key -> mock should win.
        registry = build_registry({"keys": {}, "default_provider": "openai"})
        self.assertEqual(registry.catalog()["default_provider"], "mock")
