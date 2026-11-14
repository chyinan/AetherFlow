from __future__ import annotations

import contextlib
import io
import json
import sys
import types
import unittest
from unittest.mock import Mock, patch

from ai_runtime import cli


class PrepareModelsTests(unittest.TestCase):
    def test_reports_failure_and_nonzero_status_when_ollama_pull_fails(self) -> None:
        whisper = Mock()
        summary = types.SimpleNamespace(model="qwen3.5:9b", host="http://localhost:11434")
        client = Mock()
        client.pull.side_effect = RuntimeError("connection refused")
        ollama = types.SimpleNamespace(Client=Mock(return_value=client))
        stdout = io.StringIO()

        with (
            patch.object(cli, "WhisperService", return_value=whisper),
            patch.object(cli, "SummaryService", return_value=summary),
            patch.dict(sys.modules, {"ollama": ollama}),
            contextlib.redirect_stdout(stdout),
        ):
            exit_code = cli.main(["prepare-models"])

        self.assertEqual(exit_code, 1)
        self.assertEqual(
            json.loads(stdout.getvalue()),
            {"status": "error", "error": "failed to warm Ollama model cache: connection refused"},
        )
        whisper._load_model.assert_called_once_with()
        client.pull.assert_called_once_with(summary.model)

    def test_reports_success_when_all_models_are_warmed(self) -> None:
        whisper = Mock()
        summary = types.SimpleNamespace(model="qwen3.5:9b", host="http://localhost:11434")
        client = Mock()
        ollama = types.SimpleNamespace(Client=Mock(return_value=client))
        stdout = io.StringIO()

        with (
            patch.object(cli, "WhisperService", return_value=whisper),
            patch.object(cli, "SummaryService", return_value=summary),
            patch.dict(sys.modules, {"ollama": ollama}),
            contextlib.redirect_stdout(stdout),
        ):
            exit_code = cli.main(["prepare-models"])

        self.assertEqual(exit_code, 0)
        self.assertEqual(json.loads(stdout.getvalue()), {"status": "ok"})
        whisper._load_model.assert_called_once_with()
        client.pull.assert_called_once_with(summary.model)


if __name__ == "__main__":
    unittest.main()
