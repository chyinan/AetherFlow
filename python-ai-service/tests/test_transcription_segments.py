# pattern: Functional Core

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import TranscriptionRequest, TranscriptionResponse, _transcribe_blocking


class TranscriptionSegmentsTest(unittest.TestCase):
    """处理函数层用例：直接调用 _transcribe_blocking，断言其返回的响应模型。

    响应模型 TranscriptionResponse 与 POST /v1/transcriptions 的响应体一致；
    HTTP 入口层的 text 断言见 tests/test_api.py。
    """

    def transcribe(self, segments, duration=5.0):
        model = SimpleNamespace(transcribe=lambda *args, **kwargs: (iter(segments), SimpleNamespace(duration=duration)))
        with patch("app.main._whisper_model", model):
            return _transcribe_blocking(TranscriptionRequest(fileUrl="https://example.test/mock.wav"), Path("mock.wav"))

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

    def test_numeric_only_segment_is_kept_in_the_transcribed_text(self):
        result = self.transcribe([SimpleNamespace(start=0.0, end=1.0, text="2026")])

        self.assertEqual("2026", result.text)
        self.assertIn("2026", result.srtContent)
        self.assertEqual([{"start": 0.0, "end": 1.0, "text": "2026"}],
                         [segment.model_dump() for segment in result.segments])

    def test_multiple_numeric_segments_keep_order_and_existing_separator(self):
        result = self.transcribe([
            SimpleNamespace(start=0.0, end=1.0, text="0"),
            SimpleNamespace(start=1.0, end=2.0, text="00123"),
            SimpleNamespace(start=2.0, end=3.0, text="2026"),
        ])

        self.assertEqual("0\n\n00123\n\n2026", result.text)
        self.assertEqual("0", result.srtContent.splitlines()[2])
        self.assertIn("00123", result.srtContent)
        self.assertIn("2026", result.srtContent)
        self.assertEqual(["0", "00123", "2026"], [segment.text for segment in result.segments])

    def test_mixed_text_and_numeric_segments_keep_every_body(self):
        result = self.transcribe([
            SimpleNamespace(start=0.0, end=1.0, text="今天的会议是"),
            SimpleNamespace(start=1.0, end=2.0, text="2026"),
            SimpleNamespace(start=2.0, end=3.0, text="年度计划"),
        ])

        self.assertEqual("今天的会议是\n\n2026\n\n年度计划", result.text)
        self.assertIn("2026", result.srtContent)
        self.assertEqual(["今天的会议是", "2026", "年度计划"], [segment.text for segment in result.segments])

    def test_numeric_segment_with_surrounding_whitespace_follows_existing_rules(self):
        result = self.transcribe([
            SimpleNamespace(start=0.0, end=1.0, text="  2026  "),
            SimpleNamespace(start=1.0, end=2.0, text=" 2026 年 "),
        ])

        # 片段正文按既有规则去首尾空白，数字正文本身不能被当成字幕序号删除。
        self.assertEqual("2026\n\n2026 年", result.text)
        self.assertEqual("  2026  ", result.segments[0].text)
        self.assertIn("2026", result.srtContent)

    def test_blank_segments_keep_existing_expectations(self):
        blank = self.transcribe([SimpleNamespace(start=0.0, end=1.0, text="   ")])
        self.assertEqual("", blank.text)
        self.assertEqual(["   "], [segment.text for segment in blank.segments])

        mixed = self.transcribe([
            SimpleNamespace(start=0.0, end=1.0, text="第一句"),
            SimpleNamespace(start=1.0, end=2.0, text=""),
            SimpleNamespace(start=2.0, end=3.0, text="第二句"),
        ])
        # 空片段仍占一个分隔位，既有段间分隔约定不变。
        self.assertEqual("第一句\n\n\n\n第二句", mixed.text)

    def test_single_consumption_segments_feed_text_srt_and_segments(self):
        segments = [SimpleNamespace(start=0.0, end=1.0, text="0"),
                     SimpleNamespace(start=1.0, end=2.0, text="2026")]
        consumed = {"count": 0}

        def one_shot():
            # 片段只允许读取一次；再次遍历会直接失败。
            if consumed["count"]:
                raise AssertionError("片段生成器被二次消费")
            consumed["count"] = 1
            for segment in segments:
                yield segment

        model = SimpleNamespace(transcribe=lambda *args, **kwargs: (one_shot(), SimpleNamespace(duration=2.0)))
        with patch("app.main._whisper_model", model):
            result = _transcribe_blocking(TranscriptionRequest(fileUrl="https://example.test/mock.wav"), Path("mock.wav"))

        self.assertEqual(1, consumed["count"])
        self.assertEqual("0\n\n2026", result.text)
        self.assertIn("0", result.srtContent)
        self.assertIn("2026", result.srtContent)
        self.assertEqual(["0", "2026"], [segment.text for segment in result.segments])


if __name__ == "__main__":
    unittest.main()
