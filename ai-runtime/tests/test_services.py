from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_runtime.summary.service import SummaryOptions, SummaryService
from ai_runtime.whisper.service import Segment, TranscriptionResult, WhisperService
from ai_runtime.workflow.meeting_workflow import MeetingWorkflow, WorkflowConfig


def test_whisper_service_writes_transcript_and_srt(tmp_path: Path) -> None:
    result = TranscriptionResult(
        text="Hello world\nThis is a TED talk.",
        language="en",
        duration_seconds=5.2,
        segments=[
            Segment(start=0.0, end=2.5, text="Hello world"),
            Segment(start=2.5, end=5.2, text="This is a TED talk."),
        ],
    )

    artifacts = WhisperService.write_artifacts(result, tmp_path)

    assert artifacts.transcript_path.read_text(encoding="utf-8") == "Hello world\nThis is a TED talk.\n"
    assert artifacts.srt_path.read_text(encoding="utf-8") == (
        "1\n"
        "00:00:00,000 --> 00:00:02,500\n"
        "Hello world\n\n"
        "2\n"
        "00:00:02,500 --> 00:00:05,200\n"
        "This is a TED talk.\n"
    )


def test_summary_service_builds_language_specific_meeting_notes(tmp_path: Path) -> None:
    captured = {}

    class FakeClient:
        def generate(self, **kwargs):
            captured.update(kwargs)
            return {"response": "## Meeting Notes\n\n- Main idea\n"}

    service = SummaryService(client=FakeClient(), model="qwen3.5:9b")
    summary = service.summarize(
        "Transcript text",
        SummaryOptions(language="Chinese", instruction="Summarize this TED talk into concise meeting notes."),
    )
    output = service.write_markdown(summary, tmp_path, metadata={"language": "Chinese", "model": "qwen3.5:9b"})

    assert captured["model"] == "qwen3.5:9b"
    assert "Summarize this TED talk into concise meeting notes." in captured["prompt"]
    assert "Chinese" in captured["prompt"]
    markdown = output.read_text(encoding="utf-8")
    assert "model: qwen3.5:9b" in markdown
    assert "## Meeting Notes" in markdown


def test_meeting_workflow_generates_expected_outputs(tmp_path: Path) -> None:
    class FakeWhisper:
        def transcribe(self, video_path: Path) -> TranscriptionResult:
            assert video_path.name == "talk.mp4"
            return TranscriptionResult(
                text="A compact transcript.",
                language="en",
                duration_seconds=3.0,
                segments=[Segment(start=0.0, end=3.0, text="A compact transcript.")],
            )

        def write_artifacts(self, result: TranscriptionResult, output_dir: Path):
            return WhisperService.write_artifacts(result, output_dir)

    class FakeSummary:
        def summarize(self, text: str, options: SummaryOptions) -> str:
            assert text == "A compact transcript."
            assert options.language == "English"
            return "## Meeting Notes\n\n- Compact summary\n"

        def write_markdown(self, summary: str, output_dir: Path, metadata: dict[str, str]) -> Path:
            return SummaryService.write_markdown_file(summary, output_dir, metadata)

    video = tmp_path / "talk.mp4"
    video.write_bytes(b"fake")
    workflow = MeetingWorkflow(
        config=WorkflowConfig(output_root=tmp_path / "outputs"),
        whisper_service=FakeWhisper(),
        summary_service=FakeSummary(),
    )

    result = workflow.run(video, language="English")

    assert result.output_dir.exists()
    assert result.transcript_path.name == "transcript.txt"
    assert result.srt_path.name == "subtitles.srt"
    assert result.summary_path.name == "summary.md"
    assert result.manifest_path.read_text(encoding="utf-8").count("summary.md") == 1


def test_meeting_workflow_rejects_missing_video(tmp_path: Path) -> None:
    workflow = MeetingWorkflow(
        config=WorkflowConfig(output_root=tmp_path / "outputs"),
        whisper_service=SimpleNamespace(),
        summary_service=SimpleNamespace(),
    )

    with pytest.raises(FileNotFoundError):
        workflow.run(tmp_path / "missing.mp4")
