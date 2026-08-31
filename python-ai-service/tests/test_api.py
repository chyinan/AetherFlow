import unittest
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app


class PythonAiServiceApiTest(unittest.TestCase):

    def setUp(self):
        self.environment = patch.dict("os.environ", {"APP_ENV": "dev"}, clear=False)
        self.environment.start()
        self.addCleanup(self.environment.stop)
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
            patch.dict(sys.modules, {"ollama": SimpleNamespace(Client=FakeOllamaClient)}),
        ):
            from app.main import _ollama_model_names

            names = _ollama_model_names()

        self.assertEqual(["qwen3.5:9b"], names)
        self.assertEqual("http://host.docker.internal:11434", captured["host"])
        self.assertFalse(captured["trust_env"])

    def test_ollama_model_catalog_degrades_when_runtime_dependency_is_missing(self):
        with patch("app.main._ollama_client", side_effect=ModuleNotFoundError("ollama")):
            from app.main import _ollama_model_names

            names = _ollama_model_names()

        self.assertEqual([], names)

    def test_provider_config_updates_runtime_without_exposing_secret(self):
        with (
            patch.dict("os.environ", {}, clear=False),
            patch("app.main._runtime_config_file", return_value=None),
            patch("app.main._ollama_model_names", return_value=[]),
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

    def test_llm_chat_stream_returns_503_when_runtime_is_disabled(self):
        with patch.dict("os.environ", {"ENABLE_LLM": "false"}):
            response = self.client.post(
                "/v1/llm/chat/stream",
                json={
                    "provider": "ollama",
                    "model": "llama3",
                    "prompt": "Summarize AetherFlow",
                    "options": {"temperature": 0.1},
                },
            )

        self.assertEqual(503, response.status_code)
        self.assertIn("LLM service disabled", response.json()["detail"])

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
        self.assertNotIn("objectKey", body)

    def test_transcription_returns_subtitle_content_for_durable_storage(self):
        class FakeWhisperModel:
            def transcribe(self, *_args, **_kwargs):
                return (
                    [SimpleNamespace(start=0.0, end=1.0, text="hello")],
                    SimpleNamespace(duration=1.0),
                )

        source = Path("audio.wav")
        with (
            patch.dict("os.environ", {"ENABLE_WHISPER": "true"}, clear=False),
            patch("app.main._whisper_model", FakeWhisperModel()),
            patch("app.main._materialize_source", return_value=source),
            patch("app.main._ensure_audio_source", return_value=source),
            patch("app.main._cleanup_materialized"),
        ):
            response = self.client.post(
                "/v1/transcriptions",
                json={"fileUrl": "http://minio/aetherflow/audio.wav", "language": "auto"},
            )

        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertEqual("transcription.srt", body["srtFileName"])
        self.assertIn("00:00:00,000 --> 00:00:01,000", body["srtContent"])
        self.assertNotIn("srtObjectKey", body)

    def test_ffmpeg_endpoint_rejects_unsupported_operation_before_process_spawn(self):
        with patch("app.main.subprocess.run") as run:
            response = self.client.post(
                "/v1/media/ffmpeg",
                json={"fileUrl": "http://minio/audio.mp4", "operation": "shell"},
            )

        self.assertEqual(400, response.status_code)
        run.assert_not_called()

    def test_provider_usage_metadata_preserves_real_token_counts(self):
        from app.main import _ollama_usage_metadata, _openai_usage_metadata

        openai_metadata = _openai_usage_metadata(SimpleNamespace(usage=SimpleNamespace(
            prompt_tokens=12,
            completion_tokens=7,
            total_tokens=19,
        )))
        ollama_metadata = _ollama_usage_metadata({"prompt_eval_count": 9, "eval_count": 4})

        self.assertEqual({"promptTokens": 12, "completionTokens": 7, "totalTokens": 19}, openai_metadata)
        self.assertEqual({"promptTokens": 9, "completionTokens": 4, "totalTokens": 13}, ollama_metadata)

    def test_provider_deadline_never_exceeds_java_effective_timeout(self):
        from app.main import _effective_timeout_seconds

        with patch.dict("os.environ", {"AI_PROVIDER_MAX_TIMEOUT_SECONDS": "60"}, clear=False):
            timeout = _effective_timeout_seconds(SimpleNamespace(timeoutSeconds=3.0))

        self.assertEqual(3.0, timeout)

    def test_openai_sdk_internal_retries_are_disabled(self):
        captured = {}

        class FakeCompletions:
            def create(self, **_kwargs):
                return SimpleNamespace(
                    choices=[SimpleNamespace(message=SimpleNamespace(content="ok"), finish_reason="stop")],
                    usage=None,
                )

        class FakeOpenAI:
            def __init__(self, **kwargs):
                captured.update(kwargs)
                self.chat = SimpleNamespace(completions=FakeCompletions())

        with (
            patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}, clear=False),
            patch.dict(sys.modules, {"openai": SimpleNamespace(OpenAI=FakeOpenAI)}),
        ):
            from app.main import LlmRequest, _call_openai

            response = _call_openai(LlmRequest(provider="openai", model="test", prompt="hello"))

        self.assertEqual("ok", response.text)
        self.assertEqual(0, captured["max_retries"])

    def test_code_execution_runs_main_with_json_input(self):
        response = self.client.post(
            "/v1/code/execute",
            json={
                "language": "python3",
                "code": "def main(payload):\n    print('working')\n    return {'answer': payload['value'] + 1}",
                "input": {"value": 4},
            },
        )

        self.assertEqual(200, response.status_code)
        self.assertEqual({"answer": 5}, response.json()["result"])
        self.assertEqual("working", response.json()["stdout"])
        self.assertFalse(response.json()["truncated"])

    def test_code_execution_rejects_imports_before_subprocess(self):
        response = self.client.post(
            "/v1/code/execute",
            json={
                "language": "python3",
                "code": "import os\ndef main(payload): return 1",
                "input": {},
            },
        )

        self.assertEqual(400, response.status_code)
        self.assertIn("imports are not allowed", response.json()["detail"])

    def test_code_execution_times_out(self):
        response = self.client.post(
            "/v1/code/execute",
            json={
                "language": "python3",
                "code": "def main(payload):\n    while True: pass",
                "input": {},
                "timeoutMs": 50,
            },
        )

        self.assertEqual(408, response.status_code)
        self.assertIn("timed out", response.json()["detail"])

    def test_code_execution_limits_stdout_without_losing_result(self):
        response = self.client.post(
            "/v1/code/execute",
            json={
                "language": "python3",
                "code": "def main(payload):\n    print('x' * 5000)\n    return {'ok': True}",
                "input": {},
                "maxOutputBytes": 1024,
            },
        )

        self.assertEqual(200, response.status_code)
        self.assertEqual({"ok": True}, response.json()["result"])
        self.assertTrue(response.json()["truncated"])
        self.assertLessEqual(len(response.json()["stdout"].encode('utf-8')), 1024)

    def test_general_ai_service_does_not_expose_code_runtime_in_production(self):
        with patch.dict(
            "os.environ",
            {
                "APP_ENV": "prod",
                "ENABLE_CODE_RUNTIME_ENDPOINT": "false",
                "CODE_RUNTIME_API_KEY": "k" * 48,
            },
            clear=False,
        ):
            response = self.client.post(
                "/v1/code/execute",
                json={"code": "def main(payload): return payload", "input": {}},
            )

        self.assertEqual(404, response.status_code)
        self.assertIn("not enabled on this service", response.json()["detail"])

    def test_dedicated_code_runtime_requires_service_key(self):
        from app.code_runtime_main import app as code_runtime_app

        client = TestClient(code_runtime_app)
        with patch.dict(
            "os.environ",
            {
                "APP_ENV": "prod",
                "ENABLE_CODE_RUNTIME_ENDPOINT": "true",
                "CODE_RUNTIME_API_KEY": "k" * 48,
            },
            clear=False,
        ):
            response = client.post(
                "/v1/code/execute",
                json={"code": "def main(payload): return {'ok': True}", "input": {}},
            )

        self.assertEqual(401, response.status_code)

    def test_dedicated_code_runtime_executes_with_service_key(self):
        from app.code_runtime_main import app as code_runtime_app

        client = TestClient(code_runtime_app)
        key = "k" * 48
        with patch.dict(
            "os.environ",
            {
                "APP_ENV": "prod",
                "ENABLE_CODE_RUNTIME_ENDPOINT": "true",
                "CODE_RUNTIME_API_KEY": key,
            },
            clear=False,
        ):
            response = client.post(
                "/v1/code/execute",
                headers={"X-API-Key": key},
                json={
                    "code": "def main(payload): return {'value': payload['value'] + 1}",
                    "input": {"value": 4},
                },
            )

        self.assertEqual(200, response.status_code)
        self.assertEqual({"value": 5}, response.json()["result"])

    def test_whisper_materialization_rewrites_before_internal_url_check(self):
        from app.main import _materialize_source

        original = "http://localhost:9000/aetherflow/audio.mp3"
        rewritten = "http://minio:9000/aetherflow/audio.mp3"

        class FakeResponse:
            headers = {}

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, traceback):
                return False

            def raise_for_status(self):
                return None

            def iter_bytes(self):
                yield b"audio"

        with (
            patch.dict(
                "os.environ",
                {
                    "FILE_URL_REWRITE_FROM": "http://localhost:9000",
                    "FILE_URL_REWRITE_TO": "http://minio:9000",
                },
                clear=False,
            ),
            patch("app.main.is_internal_url", side_effect=lambda url: url != rewritten),
            patch("app.main.httpx.stream", return_value=FakeResponse()) as stream,
        ):
            materialized = _materialize_source(original)

        self.addCleanup(lambda: materialized.unlink(missing_ok=True))
        self.assertTrue(materialized.exists())
        stream.assert_called_once()
        self.assertEqual(rewritten, stream.call_args.args[1])


if __name__ == "__main__":
    unittest.main()
