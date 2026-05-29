from __future__ import annotations

import json
import logging
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from ai_runtime.summary.service import SummaryOptions, SummaryService
from ai_runtime.whisper.service import TranscriptionArtifacts, TranscriptionResult, WhisperService

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class WorkflowConfig:
    output_root: Path
    summary_language: str = "Chinese"
    summary_instruction: str = "Summarize this TED talk into concise meeting notes."


@dataclass(slots=True)
class WorkflowResult:
    output_dir: Path
    transcript_path: Path
    srt_path: Path
    summary_path: Path
    manifest_path: Path
    transcription: TranscriptionResult
    summary_language: str
    summary_model: str
    whisper_model: str


class MeetingWorkflow:
    def __init__(
        self,
        config: WorkflowConfig,
        whisper_service: WhisperService | None = None,
        summary_service: SummaryService | None = None,
    ) -> None:
        self.config = config
        self.whisper_service = whisper_service or WhisperService()
        self.summary_service = summary_service or SummaryService()

    def run(
        self,
        video_path: Path | str,
        language: str | None = None,
        summary_language: str | None = None,
        whisper_language: str = "auto",
    ) -> WorkflowResult:
        source = Path(video_path)
        if not source.exists():
            raise FileNotFoundError(f"input media not found: {source}")

        run_id = self._build_run_id(source)
        output_dir = self.config.output_root / run_id
        output_dir.mkdir(parents=True, exist_ok=True)
        logger.info("workflow run started source=%s output_dir=%s", source, output_dir)

        transcription = self._transcribe(source, whisper_language)
        artifacts = self.whisper_service.write_artifacts(transcription, output_dir)

        effective_language = summary_language or language or self.config.summary_language
        summary_text = self.summary_service.summarize(
            transcription.text,
            SummaryOptions(language=effective_language, instruction=self.config.summary_instruction),
        )
        summary_path = self.summary_service.write_markdown(
            summary_text,
            output_dir,
            metadata={
                "model": getattr(self.summary_service, "model", "summary-model"),
                "language": effective_language,
                "source": source.name,
                "whisper_model": getattr(self.whisper_service, "model_name", "whisper-model"),
                "transcription_language": transcription.language,
            },
        )
        manifest_path = self._write_manifest(output_dir, source, artifacts, summary_path, transcription, effective_language)
        logger.info("workflow run completed output_dir=%s", output_dir)

        return WorkflowResult(
            output_dir=output_dir,
            transcript_path=artifacts.transcript_path,
            srt_path=artifacts.srt_path,
            summary_path=summary_path,
            manifest_path=manifest_path,
            transcription=transcription,
            summary_language=effective_language,
            summary_model=getattr(self.summary_service, "model", "summary-model"),
            whisper_model=getattr(self.whisper_service, "model_name", "whisper-model"),
        )

    def _transcribe(self, source: Path, whisper_language: str) -> TranscriptionResult:
        if whisper_language in {"", "auto", "AUTO", None}:
            return self.whisper_service.transcribe(source)
        return self.whisper_service.transcribe(source, language=whisper_language)

    def _write_manifest(
        self,
        output_dir: Path,
        source: Path,
        artifacts: TranscriptionArtifacts,
        summary_path: Path,
        transcription: TranscriptionResult,
        summary_language: str,
    ) -> Path:
        manifest = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "source": str(source),
            "language": transcription.language,
            "summaryLanguage": summary_language,
            "durationSeconds": transcription.duration_seconds,
            "files": {
                "transcript": str(artifacts.transcript_path.name),
                "subtitles": str(artifacts.srt_path.name),
                "summary": str(summary_path.name),
            },
        }
        manifest_path = output_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
        return manifest_path

    @staticmethod
    def _build_run_id(source: Path) -> str:
        stem = "".join(ch if ch.isalnum() else "-" for ch in source.stem.lower()).strip("-")
        if not stem:
            stem = "meeting"
        return f"{stem}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-{uuid4().hex[:8]}"
