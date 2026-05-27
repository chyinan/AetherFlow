import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="AetherFlow Python AI Service", version="0.1.0")


class TranscriptionRequest(BaseModel):
    fileUrl: str = Field(..., min_length=1)
    language: Optional[str] = None
    prompt: Optional[str] = None


class TranscriptionResponse(BaseModel):
    text: str
    srtObjectKey: Optional[str] = None
    durationSeconds: Optional[float] = None


@app.get("/health")
def health() -> dict:
    return {"service": "python-ai-service", "status": "UP"}


@app.post("/v1/transcriptions", response_model=TranscriptionResponse)
def transcribe(request: TranscriptionRequest) -> TranscriptionResponse:
    if os.getenv("ENABLE_WHISPER", "false").lower() != "true":
        return TranscriptionResponse(
            text=f"Transcription fallback for {request.fileUrl}",
            srtObjectKey="generated/subtitles/fallback.srt",
            durationSeconds=0.0,
        )

    source = Path(request.fileUrl)
    if not source.exists():
        return TranscriptionResponse(
            text=f"Input file is not mounted in python-ai-service: {request.fileUrl}",
            srtObjectKey=None,
            durationSeconds=0.0,
        )

    from faster_whisper import WhisperModel

    model_name = os.getenv("WHISPER_MODEL", "small")
    model = WhisperModel(model_name, device=os.getenv("WHISPER_DEVICE", "cpu"), compute_type="int8")
    segments, info = model.transcribe(str(source), language=None if request.language == "auto" else request.language)
    lines = []
    for index, segment in enumerate(segments, start=1):
        lines.append(str(index))
        lines.append(f"{_format_ts(segment.start)} --> {_format_ts(segment.end)}")
        lines.append(segment.text.strip())
        lines.append("")
    text = "\n".join(line for line in lines if line is not None)
    return TranscriptionResponse(text=text, srtObjectKey=None, durationSeconds=info.duration)


def _format_ts(seconds: float) -> str:
    milliseconds = int((seconds % 1) * 1000)
    total_seconds = int(seconds)
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    return f"{hours:02}:{minutes:02}:{secs:02},{milliseconds:03}"
