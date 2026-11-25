# pattern: Imperative Shell

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
import ollama
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app


class OllamaModelFallbackTest(unittest.TestCase):

    def run_summary(self, *, requested, configured="", installed=(), failures=None, list_status=200):
        actual_client = ollama.AsyncClient
        attempts = []
        failures = failures or {}

        def ollama_response(request):
            if request.method == "GET" and request.url.path == "/api/tags":
                return httpx.Response(list_status, json={"models": [{"model": name} for name in installed]})
            self.assertEqual(("POST", "/api/generate"), (request.method, request.url.path))
            payload = json.loads(request.content)
            model = payload["model"]
            attempts.append(model)
            self.assertEqual("Summarize the weekly project notes.", payload["prompt"])
            self.assertEqual({"temperature": 0.2}, payload["options"])
            if model in failures:
                return httpx.Response(400, json={"error": failures[model]})
            return httpx.Response(200, json={"model": model, "response": "Summary", "done": True})

        def client_factory(**kwargs):
            return actual_client(transport=httpx.MockTransport(ollama_response), **kwargs)

        with (
            patch.dict("os.environ", {
                "APP_ENV": "dev",
                "AI_DEFAULT_MODEL": configured,
                "ENABLE_LLM": "true",
                "ENABLE_WHISPER": "false",
                "PYTHON_AI_API_KEY": "",
            }),
            patch("ollama.AsyncClient", side_effect=client_factory),
        ):
            response = TestClient(app, raise_server_exceptions=False).post(
                "/v1/llm/chat",
                json={
                    "provider": "ollama",
                    "model": requested,
                    "prompt": "Summarize the weekly project notes.",
                    "options": {"temperature": 0.2},
                },
            )

        return response, attempts

    def test_missing_model_skips_embedding_only_candidate_and_reports_working_model(self):
        response, attempts = self.run_summary(
            requested="llama3",
            configured="qwen3-8b",
            installed=("qwen3:8b", "all-minilm:latest"),
            failures={"all-minilm:latest": '"all-minilm:latest" does not support generate'},
        )

        self.assertEqual(200, response.status_code)
        self.assertEqual(["all-minilm:latest", "qwen3:8b"], attempts)
        self.assertEqual("qwen3:8b", response.json()["model"])
        self.assertEqual("Summary", response.json()["text"])

    def test_configured_fallback_is_preferred_and_its_latest_alias_is_not_retried(self):
        response, attempts = self.run_summary(
            requested="llama3",
            configured="all-minilm",
            installed=("qwen3:8b", "all-minilm:latest"),
            failures={
                "all-minilm": '"all-minilm" does not support generate',
                "all-minilm:latest": '"all-minilm:latest" does not support generate',
            },
        )

        self.assertEqual(200, response.status_code)
        self.assertEqual(["all-minilm", "qwen3:8b"], attempts)

    def test_installed_requested_alias_is_not_replaced_after_capability_error(self):
        response, attempts = self.run_summary(
            requested="all-minilm",
            configured="qwen3:8b",
            installed=("all-minilm:latest", "qwen3:8b"),
            failures={"all-minilm": '"all-minilm" does not support generate'},
        )

        self.assertNotEqual(200, response.status_code)
        self.assertEqual(["all-minilm"], attempts)

    def test_other_upstream_bad_request_does_not_select_second_fallback(self):
        response, attempts = self.run_summary(
            requested="llama3",
            installed=("aaa-text:latest", "qwen3:8b"),
            failures={"aaa-text:latest": "invalid options"},
        )

        self.assertNotEqual(200, response.status_code)
        self.assertEqual(["aaa-text:latest"], attempts)

    def test_tags_failure_does_not_block_requested_model(self):
        response, attempts = self.run_summary(requested="qwen3:8b", list_status=503)

        self.assertEqual(200, response.status_code)
        self.assertEqual(["qwen3:8b"], attempts)
        self.assertEqual("qwen3:8b", response.json()["model"])


if __name__ == "__main__":
    unittest.main()
