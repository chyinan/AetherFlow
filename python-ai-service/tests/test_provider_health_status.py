# pattern: Imperative Shell

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app


class ProviderHealthStatusTest(unittest.TestCase):

    def setUp(self):
        settings = patch.dict(
            "os.environ",
            {"ENABLE_LLM": "true", "OPENAI_API_KEY": "fake-key", "OPENAI_ACTIVE_PRESET": ""},
        )
        load_env = patch("app.main._ensure_runtime_env_loaded")
        for dependency in (settings, load_env):
            dependency.start()
            self.addCleanup(dependency.stop)
        self.client = TestClient(app)

    def test_openai_health_check_skips_ollama_and_model_discovery(self):
        healthy = {"reachable": True, "latencyMillis": 1}
        with (
            patch("app.main._ollama_model_names", return_value=[]) as models,
            patch("app.main._probe_ollama", return_value={"reachable": False}) as ollama,
            patch("app.main._probe_openai", return_value=healthy) as openai,
        ):
            response = self.client.get("/ai/status", params={"probeProvider": "openai"})

        self.assertEqual(200, response.status_code)
        self.assertIn("openai", response.json()["providers"])
        self.assertEqual({"openai": healthy}, response.json()["providerHealth"])
        models.assert_not_called()
        ollama.assert_not_called()
        openai.assert_called_once_with(2.0)

    def test_ollama_health_check_reports_failure_then_fresh_success(self):
        failed = {"reachable": False, "latencyMillis": 20, "detail": "ReadTimeout"}
        healthy = {"reachable": True, "latencyMillis": 1}
        with (
            patch("app.main._ollama_model_names", return_value=[]) as models,
            patch("app.main._probe_ollama", side_effect=[failed, healthy]) as ollama,
            patch("app.main._probe_openai", return_value={"reachable": True}) as openai,
        ):
            first = self.client.get("/ai/status", params={"probeProvider": "ollama"})
            retry = self.client.get("/ai/status", params={"probeProvider": "ollama"})

        self.assertEqual(200, first.status_code)
        self.assertEqual(200, retry.status_code)
        self.assertEqual({"ollama": failed}, first.json()["providerHealth"])
        self.assertEqual({"ollama": healthy}, retry.json()["providerHealth"])
        self.assertEqual([(2.0,), (2.0,)], [call.args for call in ollama.call_args_list])
        models.assert_not_called()
        openai.assert_not_called()

    def test_ordinary_catalog_still_lists_models_without_health_probes(self):
        with (
            patch("app.main._ollama_model_names", return_value=["synthetic:1"]) as models,
            patch("app.main._probe_ollama", return_value={"reachable": True}) as ollama,
            patch("app.main._probe_openai", return_value={"reachable": True}) as openai,
        ):
            response = self.client.get("/ai/status")

        self.assertEqual(200, response.status_code)
        self.assertEqual(["synthetic:1"], response.json()["models"]["ollama"])
        self.assertIn("openai", response.json()["models"])
        self.assertNotIn("providerHealth", response.json())
        models.assert_called_once_with()
        ollama.assert_not_called()
        openai.assert_not_called()

    def test_disabled_llm_does_not_probe_even_when_requested(self):
        with (
            patch.dict("os.environ", {"ENABLE_LLM": "false"}),
            patch("app.main._ollama_model_names", return_value=[]),
            patch("app.main._probe_ollama", return_value={"reachable": True}) as ollama,
            patch("app.main._probe_openai", return_value={"reachable": True}) as openai,
        ):
            response = self.client.get("/ai/status", params={"probeProvider": "openai"})

        self.assertEqual(200, response.status_code)
        self.assertFalse(response.json()["llmEnabled"])
        self.assertEqual({}, response.json()["providerHealth"])
        ollama.assert_not_called()
        openai.assert_not_called()

    def test_unconfigured_openai_does_not_probe_the_ollama_fallback(self):
        with (
            patch("app.main._openai_route_provider_id", return_value=""),
            patch("app.main._ollama_model_names", return_value=[]) as models,
            patch("app.main._probe_ollama", return_value={"reachable": True}) as ollama,
            patch("app.main._probe_openai", return_value={"reachable": True}) as openai,
        ):
            response = self.client.get("/ai/status", params={"probeProvider": "openai"})

        self.assertEqual(200, response.status_code)
        self.assertNotIn("openai", response.json()["providers"])
        self.assertEqual({}, response.json()["providerHealth"])
        models.assert_not_called()
        ollama.assert_not_called()
        openai.assert_not_called()
