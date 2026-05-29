from __future__ import annotations

import json
import platform
import subprocess
import tempfile
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import httpx

from ai_runtime.whisper.service import WhisperService


@dataclass(slots=True)
class BenchmarkResult:
    machine: dict[str, Any]
    whisper: dict[str, Any]
    summary: dict[str, Any]


def run_benchmark(
    whisper_service: WhisperService,
    video_path: Path | None,
    sample_url: str,
    output_root: Path,
) -> dict[str, Any]:
    output_root.mkdir(parents=True, exist_ok=True)
    source = video_path or _download_sample(sample_url)
    load_started = time.perf_counter()
    whisper_service._load_model()
    load_elapsed = time.perf_counter() - load_started

    started = time.perf_counter()
    transcription = whisper_service.transcribe(source, language="auto", prompt="Benchmark sample")
    elapsed = time.perf_counter() - started
    rtf = elapsed / transcription.duration_seconds if transcription.duration_seconds else None
    speed_multiple = transcription.duration_seconds / elapsed if elapsed > 0 else None
    gpu_snapshot = _gpu_snapshot()
    estimated_vram = _estimate_vram(whisper_service, gpu_snapshot)

    result = BenchmarkResult(
        machine=_machine_info(),
        whisper={
            "model": whisper_service.model_name,
            "backend": whisper_service.resolve_backend(),
            "durationSeconds": transcription.duration_seconds,
            "modelLoadSeconds": round(load_elapsed, 3),
            "transcribeSeconds": round(elapsed, 3),
            "hotRealTimeFactor": round(rtf, 3) if rtf is not None else None,
            "hotSpeedMultiple": round(speed_multiple, 3) if speed_multiple is not None else None,
            "recommendedBatchSize": whisper_service.batch_size,
            "gpuSnapshot": gpu_snapshot,
            "estimatedVramMiB": estimated_vram,
        },
        summary={
            "recommendedModel": "qwen3.5:9b",
            "reason": "Ollama official library size is smaller than 30B models and more suitable for long TED transcripts on a 16GB GPU.",
        },
    )
    (output_root / "benchmark.json").write_text(json.dumps(asdict(result), indent=2, ensure_ascii=False), encoding="utf-8")
    return asdict(result)


def _machine_info() -> dict[str, Any]:
    return {
        "platform": platform.platform(),
        "processor": platform.processor(),
        "python": platform.python_version(),
        "cpuCount": os_cpu_count(),
    }


def os_cpu_count() -> int | None:
    try:
        return int(subprocess.check_output(["powershell", "-NoProfile", "-Command", "(Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors"], text=True).strip())
    except Exception:
        return None


def _download_sample(url: str) -> Path:
    suffix = Path(url.split("?")[0]).suffix or ".flac"
    target = Path(tempfile.gettempdir()) / f"aetherflow-benchmark-sample{suffix}"
    if not target.exists():
        response = httpx.get(url, timeout=120, follow_redirects=True)
        response.raise_for_status()
        target.write_bytes(response.content)
    return target


def _gpu_snapshot() -> dict[str, Any]:
    try:
        output = subprocess.check_output(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total,memory.used,memory.free",
                "--format=csv,noheader,nounits",
            ],
            text=True,
            stderr=subprocess.STDOUT,
        ).strip()
        if not output:
            return {"available": False}
        name, total, used, free = [part.strip() for part in output.split(",")]
        return {
            "available": True,
            "name": name,
            "memoryTotalMiB": int(total),
            "memoryUsedMiB": int(used),
            "memoryFreeMiB": int(free),
        }
    except Exception as exc:
        return {"available": False, "error": str(exc)}


def _estimate_vram(whisper_service: WhisperService, gpu_snapshot: dict[str, Any]) -> dict[str, Any]:
    if not gpu_snapshot.get("available"):
        return {"status": "unknown"}
    free = int(gpu_snapshot.get("memoryFreeMiB", 0))
    if whisper_service.resolve_backend()[0] == "cuda":
        return {
            "status": "estimated",
            "loadTargetMiB": max(0, min(whisper_service.batch_size * 250, free)),
            "freeMiB": free,
        }
    return {"status": "cpu"}
