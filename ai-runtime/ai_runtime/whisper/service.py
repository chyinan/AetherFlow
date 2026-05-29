from __future__ import annotations

import logging
import os
import re
import shutil
import site
import subprocess
import tempfile
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import ffmpeg

logger = logging.getLogger(__name__)
_CUDA_DLL_DIRS_CONFIGURED = False

_AUDIO_SUFFIXES = {".aac", ".flac", ".m4a", ".mp3", ".ogg", ".opus", ".wav"}
_VIDEO_SUFFIXES = {".avi", ".mkv", ".mov", ".mp4", ".webm"}


@dataclass(slots=True)
class Segment:
    start: float
    end: float
    text: str


@dataclass(slots=True)
class TranscriptionResult:
    text: str
    language: str
    duration_seconds: float
    segments: list[Segment]


@dataclass(slots=True)
class TranscriptionArtifacts:
    output_dir: Path
    transcript_path: Path
    srt_path: Path


class WhisperService:
    def __init__(
        self,
        model_name: str | None = None,
        download_root: Path | None = None,
        preferred_device: str | None = None,
        preferred_compute_type: str | None = None,
        batch_size: int | None = None,
    ) -> None:
        self.model_name = model_name or os.getenv("WHISPER_MODEL", "large-v3-turbo")
        self.download_root = download_root or Path(os.getenv("WHISPER_MODEL_DIR", "models/whisper"))
        self.preferred_device = preferred_device or os.getenv("WHISPER_DEVICE", "cuda")
        self.preferred_compute_type = preferred_compute_type or os.getenv("WHISPER_COMPUTE_TYPE", "float16")
        self.batch_size = batch_size or int(os.getenv("WHISPER_BATCH_SIZE", "8"))
        self._model = None
        self._pipeline = None

    def transcribe(
        self,
        video_path: Path | str,
        language: str = "auto",
        prompt: str | None = None,
    ) -> TranscriptionResult:
        source = Path(video_path)
        if not source.exists():
            raise FileNotFoundError(f"input media not found: {source}")

        temp_dir = Path(tempfile.mkdtemp(prefix="aetherflow-whisper-"))
        cleanup_paths: list[Path] = []
        try:
            audio_path = self._prepare_audio_source(source, temp_dir)
            if audio_path != source:
                cleanup_paths.append(audio_path)

            model = self._load_model()
            started = time.perf_counter()
            segments_iter, info = self._transcribe_audio(model, audio_path, language, prompt)
            segments = [
                Segment(start=float(segment.start), end=float(segment.end), text=segment.text.strip())
                for segment in segments_iter
                if segment.text and segment.text.strip()
            ]
            elapsed = time.perf_counter() - started
            logger.info(
                "whisper finished model=%s device=%s compute_type=%s elapsed=%.3fs duration=%.3fs",
                self.model_name,
                self.resolve_backend()[0],
                self.resolve_backend()[1],
                elapsed,
                float(getattr(info, "duration", 0.0) or 0.0),
            )
            return TranscriptionResult(
                text="\n".join(segment.text for segment in segments).strip(),
                language=str(getattr(info, "language", language or "unknown") or "unknown"),
                duration_seconds=float(getattr(info, "duration", 0.0) or 0.0),
                segments=segments,
            )
        finally:
            for path in cleanup_paths:
                self._safe_unlink(path)
            shutil.rmtree(temp_dir, ignore_errors=True)

    @staticmethod
    def write_artifacts(result: TranscriptionResult, output_dir: Path) -> TranscriptionArtifacts:
        output_dir.mkdir(parents=True, exist_ok=True)
        transcript_path = output_dir / "transcript.txt"
        transcript_text = result.text.strip()
        transcript_path.write_text((transcript_text + "\n") if transcript_text else "", encoding="utf-8")

        srt_path = output_dir / "subtitles.srt"
        srt_path.write_text(_segments_to_srt(result.segments), encoding="utf-8")
        return TranscriptionArtifacts(output_dir=output_dir, transcript_path=transcript_path, srt_path=srt_path)

    def resolve_backend(self) -> tuple[str, str]:
        if self.preferred_device == "cuda" and _cuda_available():
            return "cuda", self.preferred_compute_type
        return "cpu", os.getenv("WHISPER_CPU_COMPUTE_TYPE", "int8")

    def _load_model(self):
        if self._model is None:
            _configure_cuda_dll_directories()
            device, compute_type = self.resolve_backend()
            self.download_root.mkdir(parents=True, exist_ok=True)
            from faster_whisper import WhisperModel

            logger.info(
                "loading whisper model=%s device=%s compute_type=%s download_root=%s",
                self.model_name,
                device,
                compute_type,
                self.download_root,
            )
            self._model = WhisperModel(
                self.model_name,
                device=device,
                compute_type=compute_type,
                download_root=str(self.download_root),
            )
        return self._model

    def _transcribe_audio(self, model, audio_path: Path, language: str, prompt: str | None):
        language_arg = None if language in {"", "auto", "AUTO"} else language
        common_kwargs = {
            "language": language_arg,
            "initial_prompt": prompt,
            "beam_size": int(os.getenv("WHISPER_BEAM_SIZE", "5")),
            "vad_filter": True,
        }
        if self.batch_size > 1:
            try:
                from faster_whisper import BatchedInferencePipeline

                if self._pipeline is None:
                    self._pipeline = BatchedInferencePipeline(model=model)
                return self._pipeline.transcribe(
                    str(audio_path),
                    batch_size=self.batch_size,
                    without_timestamps=False,
                    **common_kwargs,
                )
            except Exception as exc:
                logger.warning("batched whisper inference unavailable, falling back to single decode: %s", exc)
        return model.transcribe(str(audio_path), **common_kwargs)

    def _prepare_audio_source(self, source: Path, temp_dir: Path) -> Path:
        suffix = source.suffix.lower()
        if suffix in _AUDIO_SUFFIXES:
            return source
        if suffix not in _VIDEO_SUFFIXES:
            raise ValueError(f"unsupported media type: {source.suffix or '<none>'}")

        if shutil.which("ffmpeg") is None:
            raise RuntimeError("ffmpeg is required for video to audio extraction")

        audio_path = temp_dir / f"{source.stem or 'audio'}-{uuid.uuid4().hex}.wav"
        logger.info("extracting audio source=%s target=%s", source, audio_path)
        (
            ffmpeg.input(str(source))
            .output(
                str(audio_path),
                vn=None,
                acodec="pcm_s16le",
                ar=16000,
                ac=1,
            )
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
        return audio_path

    @staticmethod
    def _safe_unlink(path: Path) -> None:
        try:
            if path.exists():
                path.unlink()
        except OSError:
            logger.warning("failed to remove temp file: %s", path)


def _segments_to_srt(segments: Sequence[Segment]) -> str:
    lines: list[str] = []
    for index, segment in enumerate(segments, start=1):
        lines.append(str(index))
        lines.append(f"{_format_timestamp(segment.start)} --> {_format_timestamp(segment.end)}")
        lines.append(segment.text)
        lines.append("")
    return "\n".join(lines)


def _format_timestamp(seconds: float) -> str:
    total_milliseconds = int(round(seconds * 1000))
    hours, remainder = divmod(total_milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, milliseconds = divmod(remainder, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{milliseconds:03}"


def _cuda_available() -> bool:
    _configure_cuda_dll_directories()
    try:
        import ctranslate2

        return int(ctranslate2.get_cuda_device_count()) > 0
    except Exception:
        pass
    try:
        import torch

        return bool(torch.cuda.is_available())
    except Exception:
        return False


def _configure_cuda_dll_directories() -> None:
    global _CUDA_DLL_DIRS_CONFIGURED
    if _CUDA_DLL_DIRS_CONFIGURED or os.name != "nt":
        return

    candidates: list[Path] = []
    for package_root in site.getsitepackages():
        base = Path(package_root) / "nvidia"
        candidates.extend(
            [
                base / "cublas" / "bin",
                base / "cudnn" / "bin",
                base / "cuda_nvrtc" / "bin",
            ]
        )

    existing = [path for path in candidates if path.exists()]
    for path in existing:
        os.add_dll_directory(str(path))
    if existing:
        os.environ["PATH"] = os.pathsep.join(str(path) for path in existing) + os.pathsep + os.environ.get("PATH", "")
        logger.info("configured CUDA DLL directories: %s", existing)
    _CUDA_DLL_DIRS_CONFIGURED = True
