import unittest
import sys
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app


class PythonAiServiceApiTest(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)

    def test_status_reports_provider_and_runtime_capabilities(self):
        with (
            patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}, clear=False),
            patch("app.main._ollama_model_names", return_value=["qwen3.5:9b"]),
        ):
            response = self.client.get("/ai/status")

        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertEqual("UP", body["status"])
        self.assertIn("whisper", body["capabilities"])
        self.assertIn("openai", body["providers"])
        self.assertIn("ollama", body["providers"])

    def test_status_reports_installed_ollama_models_from_runtime(self):
        with (
            patch.dict("os.environ", {"OPENAI_API_KEY": ""}, clear=False),
            patch("app.main._ollama_model_names", return_value=["qwen3.5:9b", "qwen3-coder:30b", "nomic-embed-text:latest"]),
        ):
            response = self.client.get("/ai/status")

        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertIn("ollama", body["providers"])
        self.assertNotIn("openai", body["providers"])
        self.assertEqual(
            ["qwen3.5:9b", "qwen3-coder:30b", "nomic-embed-text:latest"],
            body["models"]["ollama"],
        )

    def test_ollama_runtime_client_ignores_system_proxy_environment(self):
        captured = {}

        class FakeOllamaClient:
            def __init__(self, **kwargs):
                captured.update(kwargs)

            def list(self):
                return {"models": [{"name": "qwen3.5:9b"}]}

        with (
            patch.dict(
                "os.environ",
                {
                    "HTTP_PROXY": "http://127.0.0.1:7890",
                    "HTTPS_PROXY": "http://127.0.0.1:7890",
                    "OLLAMA_BASE_URL": "http://host.docker.internal:11434",
                },
                clear=False,
            ),
            patch("ollama.Client", FakeOllamaClient),
        ):
            from app.main import _ollama_model_names

            names = _ollama_model_names()

        self.assertEqual(["qwen3.5:9b"], names)
        self.assertEqual("http://host.docker.internal:11434", captured["host"])
        self.assertFalse(captured["trust_env"])

    def test_provider_config_updates_runtime_without_exposing_secret(self):
        with (
            patch.dict("os.environ", {}, clear=False),
            patch("app.main._runtime_config_file", return_value=None),
        ):
            response = self.client.put(
                "/ai/provider/config/openrouter",
                json={
                    "enabled": True,
                    "apiKey": "sk-openrouter-demo-secret",
                    "baseUrl": "https://openrouter.ai/api/v1",
                    "defaultModel": "qwen/qwen3.5-9b",
                },
            )
            status = self.client.get("/ai/status")

        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertEqual("openrouter", body["id"])
        self.assertTrue(body["configured"])
        self.assertTrue(body["apiKeyConfigured"])
        self.assertNotIn("sk-openrouter-demo-secret", str(body))
        self.assertIn("openai", status.json()["providers"])
        self.assertIn("qwen/qwen3.5-9b", status.json()["models"]["openai"])

    def test_llm_chat_returns_503_when_runtime_is_disabled(self):
        with patch.dict("os.environ", {"ENABLE_LLM": "false"}):
            response = self.client.post(
                "/v1/llm/chat",
                json={
                    "provider": "ollama",
                    "model": "llama3",
                    "prompt": "Summarize AetherFlow",
                    "options": {"temperature": 0.1},
                },
            )

        self.assertEqual(503, response.status_code)
        body = response.json()
        self.assertIn("LLM service disabled", body["detail"])

    def test_subtitle_endpoint_returns_srt_text(self):
        response = self.client.post(
            "/v1/subtitles",
            json={
                "text": "hello world",
                "format": "srt",
                "lineSeconds": 2,
            },
        )

        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertEqual("srt", body["format"])
        self.assertIn("00:00:00,000 --> 00:00:02,000", body["content"])
        self.assertIn("hello world", body["content"])


if __name__ == "__main__":
    unittest.main()
