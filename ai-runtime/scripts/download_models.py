from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_runtime.summary.service import SummaryService
from ai_runtime.whisper.service import WhisperService


def main() -> int:
    parser = argparse.ArgumentParser(description="Warm local model caches for AetherFlow AI runtime")
    parser.add_argument("--whisper-model", default="large-v3-turbo")
    parser.add_argument("--whisper-download-root", default="models/whisper")
    parser.add_argument("--summary-model", default="qwen3.5:9b")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)

    whisper = WhisperService(model_name=args.whisper_model, download_root=Path(args.whisper_download_root))
    whisper._load_model()

    summary = SummaryService(model=args.summary_model)
    try:
        import ollama

        ollama.Client(host=summary.host).pull(summary.model)
    except Exception as exc:
        logging.getLogger(__name__).warning("ollama pull failed: %s", exc)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
