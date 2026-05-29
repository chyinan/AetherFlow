from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class SummaryOptions:
    language: str = "Chinese"
    instruction: str = "Summarize this TED talk into concise meeting notes."
    temperature: float = 0.2


@dataclass(slots=True)
class SummaryResult:
    content: str
    model: str
    prompt: str
    language: str


class SummaryService:
    def __init__(
        self,
        client: Any | None = None,
        model: str | None = None,
        host: str | None = None,
    ) -> None:
        self.model = model or os.getenv("SUMMARY_MODEL", "qwen3.5:9b")
        self.host = host or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.client = client or self._create_client()

    def summarize(self, transcript: str, options: SummaryOptions | None = None) -> str:
        if not transcript.strip():
            raise ValueError("transcript is required")
        options = options or SummaryOptions()
        prompt = self.build_prompt(transcript, options)
        logger.info("summary request model=%s language=%s", self.model, options.language)
        response = self.client.generate(
            model=self.model,
            prompt=prompt,
            options={
                "temperature": options.temperature,
                "num_ctx": int(os.getenv("SUMMARY_NUM_CTX", "8192")),
            },
        )
        text = self._extract_text(response)
        if not text.strip():
            raise RuntimeError("summary model returned empty text")
        return text.strip()

    def write_markdown(self, summary: str, output_dir: Path, metadata: dict[str, str] | None = None) -> Path:
        metadata = dict(metadata or {})
        metadata.setdefault("model", self.model)
        return self.write_markdown_file(summary, output_dir, metadata)

    @staticmethod
    def write_markdown_file(summary: str, output_dir: Path, metadata: dict[str, str] | None = None) -> Path:
        output_dir.mkdir(parents=True, exist_ok=True)
        metadata = dict(metadata or {})
        metadata.setdefault("model", "unknown")
        metadata.setdefault("generated_at", datetime.now(timezone.utc).isoformat())
        metadata.setdefault("language", "Chinese")

        front_matter = "\n".join(f"{key}: {value}" for key, value in sorted(metadata.items()))
        markdown = f"---\n{front_matter}\n---\n\n{summary.strip()}\n"
        output_path = output_dir / "summary.md"
        output_path.write_text(markdown, encoding="utf-8")
        return output_path

    def build_prompt(self, transcript: str, options: SummaryOptions) -> str:
        language = options.language.strip() or "Chinese"
        instruction = options.instruction.strip()
        language_guidance = _language_guidance(language)
        return (
            f"You are an enterprise meeting-note assistant.\n"
            f"Write the response in {language}.\n"
            f"{language_guidance}\n"
            f"Follow this instruction exactly: {instruction}\n"
            f"Use concise bullets, keep factual wording, and preserve important names, dates, and numbers.\n"
            f"Transcript:\n{transcript.strip()}\n"
        )

    def _create_client(self):
        import ollama

        return ollama.Client(host=self.host)

    @staticmethod
    def _extract_text(response: Any) -> str:
        if isinstance(response, dict):
            return str(response.get("response", ""))
        return str(getattr(response, "response", ""))


def _language_guidance(language: str) -> str:
    normalized = language.strip().lower()
    if normalized.startswith("zh") or "中文" in language:
        return "Output in natural Chinese Markdown with headings such as 重点、结论、行动项."
    if normalized.startswith("en") or "english" in normalized:
        return "Output in clear English Markdown with headings such as Key Points, Conclusion, and Action Items."
    return "Keep the note concise and naturally written in the requested language."
