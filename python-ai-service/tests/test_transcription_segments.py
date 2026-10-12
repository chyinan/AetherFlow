# pattern: Functional Core

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import TranscriptionRequest, TranscriptionResponse, _transcribe_blocking


class TranscriptionSegmentsTest(unittest.TestCase):
    def test_lazy_segments_feed_both_legacy_subtitle_and_structured_output(self):
        segments = [SimpleNamespace(start=0.0, end=2.5, text="清晨的海边"),
                    SimpleNamespace(start=3.0, end=5.0, text="远处的帆船")]
        model = SimpleNamespace(transcribe=lambda *args, **kwargs: (iter(segments), SimpleNamespace(duration=5.0)))
        with patch("app.main._whisper_model", model):
            result = _transcribe_blocking(TranscriptionRequest(fileUrl="https://example.test/mock.wav"), Path("mock.wav"))
        self.assertEqual("清晨的海边\n\n远处的帆船", result.text)
        self.assertIn("00:00:03,000 --> 00:00:05,000", result.srtContent)
        self.assertEqual([{"start": 0.0, "end": 2.5, "text": "清晨的海边"},
                          {"start": 3.0, "end": 5.0, "text": "远处的帆船"}],
                         [segment.model_dump() for segment in result.segments])

    def test_legacy_response_without_segments_is_still_valid(self):
        result = TranscriptionResponse(text="legacy", durationSeconds=1.0)
        self.assertEqual([], result.segments)

    def test_empty_transcription_returns_an_empty_array(self):
        model = SimpleNamespace(transcribe=lambda *args, **kwargs: (iter([]), SimpleNamespace(duration=0.0)))
        with patch("app.main._whisper_model", model):
            result = _transcribe_blocking(TranscriptionRequest(fileUrl="https://example.test/mock.wav"), Path("mock.wav"))
        self.assertEqual([], result.segments)
        self.assertEqual("", result.text)


if __name__ == "__main__":
    unittest.main()
