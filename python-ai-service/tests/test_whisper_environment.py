# pattern: Imperative Shell

import sys
import unittest
from contextlib import ExitStack
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import main


class WhisperEnvironmentTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.patches = ExitStack()
        self.addCleanup(self.patches.close)
        self.patches.enter_context(patch.dict("os.environ", {
            "APP_ENV": "test",
            "ENABLE_WHISPER": "true",
            "WHISPER_MODEL": "test-small",
            "WHISPER_DEVICE": "cpu",
            "WHISPER_COMPUTE_TYPE": "int8",
        }, clear=True))
        self.ensure_env = self.patches.enter_context(patch.object(main, "_ensure_runtime_env_loaded"))
        self.patches.enter_context(patch.object(main, "_whisper_model", None))
        for name in (
            "_whisper_startup_config", "_whisper_loaded_config",
            "_whisper_startup_failure", "_whisper_dependency_loaded",
        ):
            self.patches.enter_context(patch.object(main, name, None))
        self.patches.enter_context(patch.object(main.shutil, "which", return_value="/test/ffmpeg"))
        self.patches.enter_context(patch.object(main.importlib.util, "find_spec", return_value=object()))
        self.model = object()
        self.factory = Mock(return_value=self.model)
        self.patches.enter_context(patch.dict(sys.modules, {
            "faster_whisper": SimpleNamespace(WhisperModel=self.factory),
        }))

    async def test_cold_start_loads_enabled_model_without_readiness_precondition(self):
        self.assertFalse(main._whisper_runtime_ready())

        async with main.lifespan(main.app):
            self.factory.assert_called_once_with("test-small", device="cpu", compute_type="int8")
            self.assertIs(self.model, main._whisper_model)
            self.assertTrue(main._whisper_runtime_ready())

        self.assertIsNone(main._whisper_model)
        self.assertIsNone(main._whisper_loaded_config)

    async def test_disabled_startup_does_not_construct_model(self):
        with patch.dict("os.environ", {"ENABLE_WHISPER": "false"}):
            async with main.lifespan(main.app):
                body = main.whisper_environment()

        self.factory.assert_not_called()
        self.assertEqual("unconfigured", body["status"])
        self.assertFalse(body["enabled"])
        self.assertFalse(body["restartRequired"])
        self.assertIsNone(body["loadedModel"])

    async def test_loaded_model_reports_actual_identity_and_copyable_environment(self):
        async with main.lifespan(main.app):
            body = main.whisper_environment()

        self.assertEqual("usable", body["status"])
        self.assertEqual("test-small", body["model"])
        self.assertEqual("test-small", body["loadedModel"])
        self.assertEqual("cpu", body["device"])
        self.assertEqual("int8", body["computeType"])
        self.assertTrue(body["dependencyAvailable"])
        self.assertTrue(body["ffmpegAvailable"])
        self.assertEqual("backend", body["detectedFrom"])
        self.assertFalse(body["restartRequired"])
        self.assertEqual({
            "ENABLE_WHISPER": "true",
            "WHISPER_MODEL": "test-small",
            "WHISPER_DEVICE": "cpu",
            "WHISPER_COMPUTE_TYPE": "int8",
        }, body["environmentVariables"])

    async def test_changed_model_device_and_compute_type_require_restart_without_hot_swap(self):
        async with main.lifespan(main.app):
            for variable, value, field in (
                ("WHISPER_MODEL", "test-large", "model"),
                ("WHISPER_DEVICE", "cuda", "device"),
                ("WHISPER_COMPUTE_TYPE", "float16", "computeType"),
            ):
                with self.subTest(variable=variable), patch.dict("os.environ", {variable: value}):
                    body = main.whisper_environment()
                    self.assertEqual(value, body[field])
                    self.assertEqual("test-small", body["loadedModel"])
                    self.assertEqual("usable", body["status"])
                    self.assertTrue(body["restartRequired"])
                    self.assertIn("手动重启", body["message"])
                    self.assertIs(self.model, main._whisper_model)
            self.factory.assert_called_once()

    async def test_enable_change_requires_restart_without_loading_on_read(self):
        with patch.dict("os.environ", {"ENABLE_WHISPER": "false"}):
            async with main.lifespan(main.app):
                with patch.dict("os.environ", {"ENABLE_WHISPER": "true"}):
                    body = main.whisper_environment()
                    self.assertEqual("unloaded", body["status"])
                    self.assertTrue(body["restartRequired"])
                    self.assertIsNone(body["loadedModel"])
        self.factory.assert_not_called()

    async def test_disable_change_preserves_loaded_identity_until_shutdown(self):
        async with main.lifespan(main.app):
            with patch.dict("os.environ", {"ENABLE_WHISPER": "false"}):
                body = main.whisper_environment()
                self.assertEqual("unconfigured", body["status"])
                self.assertEqual("test-small", body["loadedModel"])
                self.assertTrue(body["restartRequired"])
                self.assertIs(self.model, main._whisper_model)

    def test_repeated_gets_are_read_only_and_do_not_probe_configured_model_path(self):
        with (
            patch.dict("os.environ", {
                "AI_SERVICE_API_KEY": "test-runtime-key",
                "WHISPER_MODEL": "/arbitrary/configured/model-directory",
            }),
            patch.object(main.Path, "exists", side_effect=AssertionError("不能探测配置模型路径")),
            patch.object(main.Path, "read_text", side_effect=AssertionError("不能读取模型路径")),
            patch.object(main.subprocess, "run") as run,
        ):
            client = TestClient(main.app)
            for _ in range(3):
                response = client.get("/ai/whisper/environment", headers={"X-API-Key": "test-runtime-key"})
                self.assertEqual(200, response.status_code)
                body = response.json()
                self.assertEqual("unloaded", body["status"])
                self.assertEqual("/arbitrary/configured/model-directory", body["model"])
                self.assertIsNone(body["loadedModel"])

        self.factory.assert_not_called()
        self.ensure_env.assert_not_called()
        run.assert_not_called()

    def test_route_reuses_existing_runtime_api_key_dependency(self):
        route = next(route for route in main.app.routes if route.path == "/ai/whisper/environment")
        self.assertEqual({"GET"}, route.methods)
        self.assertIn(main._require_runtime_api_key, [dependency.call for dependency in route.dependant.dependencies])

    async def test_repeated_environment_and_readiness_probes_do_not_reload_model(self):
        async with main.lifespan(main.app):
            for _ in range(3):
                self.assertTrue(main._whisper_runtime_ready())
                self.assertEqual("usable", main.whisper_environment()["status"])
            self.factory.assert_called_once()

    async def test_concrete_missing_file_on_startup_reports_missing_model_without_exception_details(self):
        self.factory.side_effect = FileNotFoundError("private-model-path secret-token")

        async with main.lifespan(main.app):
            body = main.whisper_environment()

        self.assertEqual("missing_model", body["status"])
        self.assertTrue(body["restartRequired"])
        self.assertTrue(body["dependencyAvailable"])
        self.assertIsNone(body["loadedModel"])
        self.assertNotIn("private-model-path", str(body))
        self.assertNotIn("secret-token", str(body))

    async def test_other_startup_failures_remain_unloaded_and_sanitized(self):
        for error in (OSError, RuntimeError, ImportError, ValueError):
            with self.subTest(error=error):
                self.factory.side_effect = error("private-server secret-token")
                async with main.lifespan(main.app):
                    body = main.whisper_environment()
                    self.assertEqual("unloaded", body["status"])
                    self.assertTrue(body["restartRequired"])
                    self.assertIsNone(body["loadedModel"])
                    self.assertFalse(main._whisper_runtime_ready())
                    self.assertNotIn("private-server", str(body))
                    self.assertNotIn("secret-token", str(body))

    async def test_missing_dependency_does_not_construct_model(self):
        with patch.dict(sys.modules, {"faster_whisper": None}):
            async with main.lifespan(main.app):
                body = main.whisper_environment()

        self.factory.assert_not_called()
        self.assertEqual("unloaded", body["status"])
        self.assertFalse(body["dependencyAvailable"])
        self.assertIn("faster-whisper", body["message"])

    def test_dependency_probe_does_not_import_runtime(self):
        with (
            patch.dict(sys.modules, {"faster_whisper": None}),
            patch.object(main.importlib.util, "find_spec", return_value=None) as find_spec,
        ):
            body = main.whisper_environment()

        find_spec.assert_called_once_with("faster_whisper")
        self.assertFalse(body["dependencyAvailable"])
        self.assertEqual("unloaded", body["status"])
        self.factory.assert_not_called()

    async def test_missing_model_failure_is_not_applied_to_changed_configuration(self):
        self.factory.side_effect = FileNotFoundError("model unavailable")
        async with main.lifespan(main.app):
            with patch.dict("os.environ", {"WHISPER_MODEL": "different-model"}):
                body = main.whisper_environment()

        self.assertEqual("unloaded", body["status"])
        self.assertTrue(body["restartRequired"])
        self.factory.assert_called_once()

    async def test_missing_ffmpeg_is_unconfigured_while_preserving_loaded_model_identity(self):
        async with main.lifespan(main.app):
            with patch.object(main.shutil, "which", return_value=None):
                body = main.whisper_environment()
                self.assertTrue(main._whisper_runtime_ready())
                self.assertIs(self.model, main._whisper_model)

        self.assertEqual("unconfigured", body["status"])
        self.assertTrue(body["enabled"])
        self.assertEqual("test-small", body["loadedModel"])
        self.assertFalse(body["ffmpegAvailable"])
        self.assertIn("Whisper 模型已加载", body["message"])
        self.assertIn("缺少 FFmpeg 环境前置条件", body["message"])
        self.factory.assert_called_once()

    async def test_ffmpeg_recovery_reports_usable_without_reloading_model(self):
        async with main.lifespan(main.app):
            with patch.object(main.shutil, "which", return_value=None):
                self.assertEqual("unconfigured", main.whisper_environment()["status"])
            body = main.whisper_environment()
            self.assertEqual("usable", body["status"])
            self.assertTrue(body["ffmpegAvailable"])
            self.assertEqual("test-small", body["loadedModel"])
            self.assertIs(self.model, main._whisper_model)
            self.factory.assert_called_once()

    async def test_shutdown_clears_instance_and_loaded_identity_on_exception(self):
        with self.assertRaisesRegex(RuntimeError, "test shutdown"):
            async with main.lifespan(main.app):
                raise RuntimeError("test shutdown")

        self.assertIsNone(main._whisper_model)
        self.assertIsNone(main._whisper_loaded_config)
        self.assertFalse(main._whisper_runtime_ready())

    def test_default_configuration_reports_model_name_without_path_detection(self):
        with patch.dict("os.environ", {"APP_ENV": "test"}, clear=True):
            body = main.whisper_environment()

        self.assertEqual("small", body["model"])
        self.assertEqual("cpu", body["device"])
        self.assertEqual("int8", body["computeType"])
        self.assertEqual("unloaded", body["status"])
        self.factory.assert_not_called()


if __name__ == "__main__":
    unittest.main()
