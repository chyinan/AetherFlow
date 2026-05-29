from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path

from ai_runtime.summary.service import SummaryService
from ai_runtime.whisper.service import WhisperService
from ai_runtime.workflow.meeting_workflow import MeetingWorkflow, WorkflowConfig


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AetherFlow AI runtime demo")
    parser.add_argument("--log-level", default=os.getenv("LOG_LEVEL", "INFO"))
    subparsers = parser.add_subparsers(dest="command", required=True)

    run_parser = subparsers.add_parser("run", help="Run the full meeting workflow")
    run_parser.add_argument("--video", required=True)
    run_parser.add_argument("--output-root", default="outputs")
    run_parser.add_argument("--language", default=None, help="Summary output language alias, for example Chinese or English")
    run_parser.add_argument("--summary-language", default=None)
    run_parser.add_argument("--whisper-language", default="auto")

    bench_parser = subparsers.add_parser("benchmark", help="Benchmark Whisper on a sample or input video")
    bench_parser.add_argument("--video")
    bench_parser.add_argument("--sample-url", default=os.getenv("BENCHMARK_SAMPLE_URL", "https://github.com/openai/whisper/raw/main/tests/jfk.flac"))
    bench_parser.add_argument("--output-root", default="outputs/benchmark")

    status_parser = subparsers.add_parser("status", help="Show runtime status")
    status_parser.add_argument("--output-root", default="outputs")

    prepare_parser = subparsers.add_parser("prepare-models", help="Warm local model caches")
    prepare_parser.add_argument("--output-root", default="outputs")

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    logging.basicConfig(level=getattr(logging, str(args.log_level).upper(), logging.INFO))

    if args.command == "run":
        workflow = _build_workflow(Path(args.output_root))
        result = workflow.run(
            Path(args.video),
            language=args.language,
            summary_language=args.summary_language,
            whisper_language=args.whisper_language,
        )
        print(json.dumps(_serialize_result(result), indent=2, ensure_ascii=False))
        return 0

    if args.command == "benchmark":
        from ai_runtime.benchmark import run_benchmark

        benchmark = run_benchmark(
            whisper_service=WhisperService(),
            video_path=Path(args.video) if args.video else None,
            sample_url=args.sample_url,
            output_root=Path(args.output_root),
        )
        print(json.dumps(benchmark, indent=2, ensure_ascii=False))
        return 0

    if args.command == "status":
        whisper = WhisperService()
        summary = SummaryService()
        payload = {
            "python": sys.executable,
            "whisperModel": whisper.model_name,
            "whisperBackend": whisper.resolve_backend(),
            "summaryModel": summary.model,
            "ffmpeg": _command_exists("ffmpeg"),
            "ollama": _command_exists("ollama"),
        }
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return 0

    if args.command == "prepare-models":
        _prepare_models()
        print(json.dumps({"status": "ok"}, indent=2))
        return 0

    parser.error(f"unsupported command: {args.command}")
    return 1


def _build_workflow(output_root: Path) -> MeetingWorkflow:
    config = WorkflowConfig(output_root=output_root)
    return MeetingWorkflow(config=config, whisper_service=WhisperService(), summary_service=SummaryService())


def _serialize_result(result) -> dict[str, object]:
    return {
        "outputDir": str(result.output_dir),
        "transcriptPath": str(result.transcript_path),
        "srtPath": str(result.srt_path),
        "summaryPath": str(result.summary_path),
        "manifestPath": str(result.manifest_path),
        "language": result.transcription.language,
        "durationSeconds": result.transcription.duration_seconds,
        "summaryLanguage": result.summary_language,
        "summaryModel": result.summary_model,
        "whisperModel": result.whisper_model,
    }


def _prepare_models() -> None:
    whisper = WhisperService()
    whisper._load_model()
    summary = SummaryService()
    try:
        import ollama

        ollama.Client(host=summary.host).pull(summary.model)
    except Exception as exc:
        logging.getLogger(__name__).warning("failed to warm ollama model cache: %s", exc)


def _command_exists(name: str) -> bool:
    import shutil

    return shutil.which(name) is not None


if __name__ == "__main__":
    raise SystemExit(main())
