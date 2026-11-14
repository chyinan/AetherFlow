from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
RUNTIME_ROOT = REPOSITORY_ROOT / "ai-runtime"
DOWNLOAD_SCRIPT = RUNTIME_ROOT / "scripts" / "download_models.py"
SETUP_SCRIPT = RUNTIME_ROOT / "scripts" / "setup_runtime.ps1"
POWERSHELL = shutil.which("pwsh") or shutil.which("powershell")
WINDOWS_SETUP_TEST_AVAILABLE = sys.platform == "win32" and POWERSHELL is not None


STUB_SITE_CUSTOMIZE = r'''
import os
import sys
from types import ModuleType


def _package(name):
    module = ModuleType(name)
    module.__path__ = []
    sys.modules[name] = module
    return module


_package("ai_runtime")
_package("ai_runtime.whisper")
_package("ai_runtime.summary")


class WhisperService:
    def __init__(self, model_name, download_root):
        self.model_name = model_name
        self.download_root = download_root

    def _load_model(self):
        print("stub whisper load")
        if os.environ.get("AETHERFLOW_STUB_WHISPER_FAIL") == "1":
            raise RuntimeError("controlled whisper failure")


whisper_module = ModuleType("ai_runtime.whisper.service")
whisper_module.WhisperService = WhisperService
sys.modules[whisper_module.__name__] = whisper_module


class SummaryService:
    def __init__(self, model):
        self.model = model
        self.host = "http://ollama.invalid"


summary_module = ModuleType("ai_runtime.summary.service")
summary_module.SummaryService = SummaryService
sys.modules[summary_module.__name__] = summary_module


class FakeOllamaClient:
    def __init__(self, host):
        self.host = host

    def pull(self, model):
        if os.environ.get("AETHERFLOW_STUB_OLLAMA_FAIL") == "1":
            raise RuntimeError("controlled Ollama pull failure")
        print("stub Ollama pull succeeded")


ollama_module = ModuleType("ollama")
ollama_module.Client = FakeOllamaClient
sys.modules["ollama"] = ollama_module
'''


class DownloadModelsCommandTests(unittest.TestCase):
    def run_download_script(self, *, whisper_fails: bool = False, ollama_fails: bool = False) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory(prefix="aetherflow-model-setup-") as temp_dir:
            temp_path = Path(temp_dir)
            stubs = temp_path / "stubs"
            stubs.mkdir()
            (stubs / "sitecustomize.py").write_text(STUB_SITE_CUSTOMIZE, encoding="utf-8")
            whisper_root = temp_path / "whisper-models"

            environment = os.environ.copy()
            environment["PYTHONPATH"] = str(stubs)
            environment["AETHERFLOW_STUB_WHISPER_FAIL"] = "1" if whisper_fails else "0"
            environment["AETHERFLOW_STUB_OLLAMA_FAIL"] = "1" if ollama_fails else "0"

            return subprocess.run(
                [
                    sys.executable,
                    str(DOWNLOAD_SCRIPT),
                    "--whisper-model",
                    "stub-whisper",
                    "--whisper-download-root",
                    str(whisper_root),
                    "--summary-model",
                    "stub-summary",
                ],
                cwd=RUNTIME_ROOT,
                env=environment,
                capture_output=True,
                text=True,
                check=False,
                timeout=30,
            )

    def test_documented_helper_succeeds_when_required_pulls_succeed(self) -> None:
        result = self.run_download_script()

        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("stub whisper load", result.stdout)
        self.assertIn("stub Ollama pull succeeded", result.stdout)

    def test_documented_helper_fails_when_ollama_pull_fails(self) -> None:
        result = self.run_download_script(ollama_fails=True)

        self.assertNotEqual(result.returncode, 0, msg=result.stdout)
        self.assertIn("ollama pull failed", result.stderr.lower())

    def test_documented_helper_fails_when_whisper_load_fails(self) -> None:
        result = self.run_download_script(whisper_fails=True)

        self.assertNotEqual(result.returncode, 0, msg=result.stdout)
        self.assertNotIn("stub Ollama pull succeeded", result.stdout)

    @unittest.skipUnless(
        WINDOWS_SETUP_TEST_AVAILABLE,
        "requires Windows and an installed PowerShell executable",
    )
    def test_windows_setup_propagates_model_pull_result(self) -> None:
        with tempfile.TemporaryDirectory(prefix="aetherflow-setup-runtime-") as temp_dir:
            temp_path = Path(temp_dir)
            runtime = temp_path / "runtime with spaces"
            scripts = runtime / "scripts"
            scripts.mkdir(parents=True)
            shutil.copy2(DOWNLOAD_SCRIPT, scripts / "download_models.py")
            (runtime / "requirements.txt").write_text("", encoding="utf-8")

            venv = runtime / ".venv"
            subprocess.run(
                [sys.executable, "-m", "venv", "--without-pip", str(venv)],
                check=True,
                capture_output=True,
                text=True,
                timeout=60,
            )

            stubs = temp_path / "stubs"
            stubs.mkdir()
            (stubs / "sitecustomize.py").write_text(STUB_SITE_CUSTOMIZE, encoding="utf-8")
            (stubs / "pip.py").write_text("print('controlled pip stub')\n", encoding="utf-8")

            command = [
                str(POWERSHELL),
                "-NoProfile",
                "-NonInteractive",
                "-File",
                str(SETUP_SCRIPT),
                "-RuntimeRoot",
                str(runtime),
                "-WhisperModel",
                "controlled-whisper",
                "-SummaryModel",
                "controlled-summary",
            ]

            for ollama_fails in (True, False):
                with self.subTest(ollama_fails=ollama_fails):
                    environment = os.environ.copy()
                    environment.pop("PYTHONHOME", None)
                    environment["PYTHONPATH"] = str(stubs)
                    environment["AETHERFLOW_STUB_WHISPER_FAIL"] = "0"
                    environment["AETHERFLOW_STUB_OLLAMA_FAIL"] = "1" if ollama_fails else "0"
                    result = subprocess.run(
                        command,
                        cwd=REPOSITORY_ROOT,
                        env=environment,
                        capture_output=True,
                        text=True,
                        check=False,
                        timeout=60,
                    )
                    output = result.stdout + result.stderr

                    self.assertEqual(output.count("controlled pip stub"), 2, msg=output)
                    self.assertIn("stub whisper load", output)
                    if ollama_fails:
                        self.assertNotEqual(result.returncode, 0, msg=output)
                        self.assertIn("ollama pull failed", output.lower())
                        self.assertIn("exit code 1", output.lower())
                        self.assertNotIn("Runtime ready", output)
                    else:
                        self.assertEqual(result.returncode, 0, msg=output)
                        self.assertIn(f"Runtime ready at {runtime}", output)


if __name__ == "__main__":
    unittest.main()
