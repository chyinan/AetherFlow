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
        response = self.client.get("/ai/status")

        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertEqual("UP", body["status"])
        self.assertIn("whisper", body["capabilities"])
        self.assertIn("openai", body["providers"])
        self.assertIn("ollama", body["providers"])

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
