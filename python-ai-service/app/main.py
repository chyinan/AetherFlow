import logging
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Any, Optional

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("aetherflow.python-ai")

app = FastAPI(title="AetherFlow Python AI Service", version="0.2.0")


class TranscriptionRequest(BaseModel):
    fileUrl: str = Field(..., min_length=1)
    language: Optional[str] = None
    prompt: Optional[str] = None


class TranscriptionResponse(BaseModel):
    text: str
    srtObjectKey: Optional[str] = None
    durationSeconds: Optional[float] = None


class LlmRequest(BaseModel):
    provider: str = Field(default="ollama")
    model: str = Field(default="llama3")
    prompt: str = Field(..., min_length=1)
    options: dict[str, Any] = Field(default_factory=dict)


class LlmResponse(BaseModel):
    provider: str
    model: str
    text: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class SubtitleRequest(BaseModel):
    text: str = Field(..., min_length=1)
    format: str = Field(default="srt")
    lineSeconds: float = Field(default=3.0, ge=0.5, le=30.0)


class SubtitleResponse(BaseModel):
    content: str
    format: str
    objectKey: Optional[str] = None


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled python ai runtime error path=%s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={"code": 500, "message": str(exc), "path": request.url.path},
    )


@app.get("/health")
def health() -> dict[str, Any]:
    return {"service": "python-ai-service", "status": "UP"}


@app.get("/ai/status")
def ai_status() -> dict[str, Any]:
    return {
        "service": "python-ai-service",
        "status": "UP",
        "capabilities": ["whisper", "ffmpeg", "subtitle", "llm"],
        "providers": ["openai", "ollama"],
        "whisperEnabled": _enabled("ENABLE_WHISPER"),
        "llmEnabled": _enabled("ENABLE_LLM"),
        "ffmpegAvailable": shutil.which("ffmpeg") is not None,
    }


@app.post("/v1/transcriptions", response_model=TranscriptionResponse)
def transcribe(request: TranscriptionRequest) -> TranscriptionResponse:
    logger.info("ASR request fileUrl=%s language=%s", request.fileUrl, request.language)
    if not _enabled("ENABLE_WHISPER"):
        return TranscriptionResponse(
            text=f"Transcription fallback for {request.fileUrl}",
            srtObjectKey="generated/subtitles/fallback.srt",
            durationSeconds=0.0,
        )

    source = _materialize_source(request.fileUrl)
    audio_source = _ensure_audio_source(source)
    try:
        from faster_whisper import WhisperModel

        model_name = os.getenv("WHISPER_MODEL", "small")
        model = WhisperModel(model_name, device=os.getenv("WHISPER_DEVICE", "cpu"), compute_type=os.getenv("WHISPER_COMPUTE_TYPE", "int8"))
        segments, info = model.transcribe(
            str(audio_source),
            language=None if request.language in (None, "", "auto") else request.language,
            initial_prompt=request.prompt,
        )
        srt_content = _segments_to_srt(segments)
        object_key = _write_generated_subtitle(srt_content, "srt")
        text = "\n".join(line for line in srt_content.splitlines() if "-->" not in line and not line.isdigit()).strip()
        return TranscriptionResponse(text=text, srtObjectKey=object_key, durationSeconds=info.duration)
    finally:
        _cleanup_materialized(source, audio_source)


@app.post("/v1/llm/chat", response_model=LlmResponse)
def llm_chat(request: LlmRequest) -> LlmResponse:
    provider = request.provider.lower().strip()
    logger.info("LLM request provider=%s model=%s", provider, request.model)
    if not _enabled("ENABLE_LLM"):
        return LlmResponse(
            provider=provider,
            model=request.model,
            text=f"LLM fallback [{provider}/{request.model}]: {request.prompt}",
            metadata={"fallback": True},
        )
    if provider == "openai":
        return _call_openai(request)
    if provider == "ollama":
        return _call_ollama(request)
    raise HTTPException(status_code=400, detail=f"unsupported llm provider: {request.provider}")


@app.post("/v1/subtitles", response_model=SubtitleResponse)
def subtitles(request: SubtitleRequest) -> SubtitleResponse:
    fmt = request.format.lower().strip()
    if fmt not in {"srt", "vtt"}:
        raise HTTPException(status_code=400, detail="subtitle format must be srt or vtt")
    content = _text_to_subtitle(request.text, fmt, request.lineSeconds)
    object_key = _write_generated_subtitle(content, fmt)
    return SubtitleResponse(content=content, format=fmt, objectKey=object_key)


def _call_openai(request: LlmRequest) -> LlmResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured")
    from openai import OpenAI

    client = OpenAI(api_key=api_key, timeout=float(os.getenv("OPENAI_TIMEOUT_SECONDS", "60")))
    completion = client.chat.completions.create(
        model=request.model,
        messages=[{"role": "user", "content": request.prompt}],
        temperature=float(request.options.get("temperature", 0.2)),
    )
    text = completion.choices[0].message.content or ""
    return LlmResponse(provider="openai", model=request.model, text=text, metadata={"finishReason": completion.choices[0].finish_reason})


def _call_ollama(request: LlmRequest) -> LlmResponse:
    import ollama

    client = ollama.Client(host=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"))
    response = client.generate(
        model=request.model,
        prompt=request.prompt,
        options=request.options,
    )
    return LlmResponse(provider="ollama", model=request.model, text=response.get("response", ""), metadata={"done": response.get("done", False)})


def _materialize_source(file_url: str) -> Path:
    if file_url.startswith("http://") or file_url.startswith("https://"):
        suffix = Path(file_url.split("?")[0]).suffix or ".bin"
        target = Path(tempfile.gettempdir()) / f"aetherflow-input-{uuid.uuid4().hex}{suffix}"
        download_url = _rewrite_file_url(file_url)
        if download_url != file_url:
            logger.info("Rewrote fileUrl for container download from %s to %s", file_url, download_url)
        with httpx.stream("GET", download_url, timeout=float(os.getenv("FILE_DOWNLOAD_TIMEOUT_SECONDS", "60"))) as response:
            response.raise_for_status()
            with target.open("wb") as output:
                for chunk in response.iter_bytes():
                    output.write(chunk)
        return target
    source = Path(file_url)
    if not source.exists():
        raise HTTPException(status_code=400, detail=f"input file does not exist: {file_url}")
    return source


def _rewrite_file_url(file_url: str) -> str:
    rewrite_from = os.getenv("FILE_URL_REWRITE_FROM", "").strip().rstrip("/")
    rewrite_to = os.getenv("FILE_URL_REWRITE_TO", "").strip().rstrip("/")
    if not rewrite_from or not rewrite_to:
        return file_url
    if file_url == rewrite_from:
        return rewrite_to
    if file_url.startswith(f"{rewrite_from}/"):
        return f"{rewrite_to}{file_url[len(rewrite_from):]}"
    return file_url


def _ensure_audio_source(source: Path) -> Path:
    suffix = source.suffix.lower()
    if suffix in {".mp3", ".wav", ".m4a", ".aac", ".flac"}:
        return source
    if suffix in {".mp4", ".mov", ".mkv"}:
        if shutil.which("ffmpeg") is None:
            raise HTTPException(status_code=503, detail="ffmpeg is not installed")
        target = Path(tempfile.gettempdir()) / f"aetherflow-audio-{uuid.uuid4().hex}.wav"
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(source), "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", str(target)],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=int(os.getenv("FFMPEG_TIMEOUT_SECONDS", "120")),
        )
        return target
    raise HTTPException(status_code=400, detail=f"unsupported media format: {suffix}")


def _segments_to_srt(segments: Any) -> str:
    lines: list[str] = []
    for index, segment in enumerate(segments, start=1):
        lines.append(str(index))
        lines.append(f"{_format_srt_ts(segment.start)} --> {_format_srt_ts(segment.end)}")
        lines.append(segment.text.strip())
        lines.append("")
    return "\n".join(lines)


def _text_to_subtitle(text: str, fmt: str, line_seconds: float) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()] or [text.strip()]
    output: list[str] = ["WEBVTT", ""] if fmt == "vtt" else []
    for index, line in enumerate(lines, start=1):
        start = (index - 1) * line_seconds
        end = index * line_seconds
        if fmt == "srt":
            output.append(str(index))
            output.append(f"{_format_srt_ts(start)} --> {_format_srt_ts(end)}")
        else:
            output.append(f"{_format_vtt_ts(start)} --> {_format_vtt_ts(end)}")
        output.append(line)
        output.append("")
    return "\n".join(output)


def _write_generated_subtitle(content: str, fmt: str) -> str:
    object_key = f"generated/subtitles/{uuid.uuid4().hex}.{fmt}"
    output_dir = Path(os.getenv("AI_OUTPUT_DIR", tempfile.gettempdir())) / "aetherflow" / "generated" / "subtitles"
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / Path(object_key).name).write_text(content, encoding="utf-8")
    return object_key


def _format_srt_ts(seconds: float) -> str:
    milliseconds = int((seconds % 1) * 1000)
    total_seconds = int(seconds)
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    return f"{hours:02}:{minutes:02}:{secs:02},{milliseconds:03}"


def _format_vtt_ts(seconds: float) -> str:
    return _format_srt_ts(seconds).replace(",", ".")


def _cleanup_materialized(source: Path, audio_source: Path) -> None:
    temp_dir = Path(tempfile.gettempdir())
    for path in {source, audio_source}:
        try:
            if temp_dir in path.parents and path.exists():
                path.unlink()
        except OSError:
            logger.warning("Failed to cleanup temp file %s", path)


def _enabled(name: str) -> bool:
    return os.getenv(name, "false").lower() == "true"
