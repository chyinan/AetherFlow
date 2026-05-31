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

    def test_llm_chat_returns_fallback_when_runtime_is_disabled(self):
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

        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertEqual("ollama", body["provider"])
        self.assertIn("Summarize AetherFlow", body["text"])

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
