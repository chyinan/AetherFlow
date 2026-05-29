# AetherFlow AI Meeting Workflow Demo Runtime

This runtime runs the local demo pipeline:

```text
meeting video -> FFmpeg audio extraction -> faster-whisper transcription -> Ollama summary -> Markdown + SRT
```

## Relationship To `python-ai-service`

`python-ai-service/` is the service-facing FastAPI runtime used by `backend/ai-service`.
`ai-runtime/` is a local-only Windows demo toolkit for model warmup, CUDA / FFmpeg / Ollama validation, benchmarking, and one-shot meeting video runs.

Do not treat `ai-runtime/` as a production microservice or a replacement for `python-ai-service`.

## Runtime Status On This Machine

- Python: 3.11.9 in `ai-runtime/.venv`
- FFmpeg: installed and available on `PATH`
- Ollama: installed and available on `PATH`
- Whisper: `large-v3-turbo`
- Whisper backend: CUDA + FP16 through CTranslate2
- Summary model: `qwen3.5:9b`
- CUDA runtime DLLs: provided by `nvidia-cublas-cu12` and `nvidia-cudnn-cu12` in the venv

## Setup

From the repo root:

```powershell
cd ai-runtime
.\scripts\setup_runtime.ps1
```

The script creates `.venv`, installs `requirements.txt`, downloads the Whisper model into `models/whisper`, and pulls the Ollama summary model.

## Run A Video

```powershell
cd ai-runtime
.\scripts\run_demo.ps1 -VideoPath "D:\path\to\ted-talk.mp4" -SummaryLanguage English
```

Chinese summary:

```powershell
.\scripts\run_demo.ps1 -VideoPath "D:\path\to\ted-talk.mp4" -SummaryLanguage Chinese
```

The command prints a JSON result with:

- `transcriptPath`
- `srtPath`
- `summaryPath`
- `manifestPath`

## Outputs

Each run creates a timestamped folder under `outputs/runs/`.

```text
outputs/runs/<video-name>-<timestamp>-<id>/
  transcript.txt
  subtitles.srt
  summary.md
  manifest.json
```

Open `subtitles.srt` in VLC or import it into a video player as an external subtitle file. Open `summary.md` directly in any Markdown viewer.

## Benchmark

```powershell
cd ai-runtime
.\.venv\Scripts\python.exe -m ai_runtime.cli benchmark --output-root outputs\benchmark
```

Current measured result on this machine:

- GPU: NVIDIA GeForce RTX 5070 Ti, 16GB VRAM
- Model: `large-v3-turbo`
- Backend: CUDA + FP16
- Hot transcription speed on 11s English sample: 18.09x real-time
- Hot real-time factor: 0.055
- Model load time: 6.249s
- Recommended batch size: 8
- Observed GPU memory during benchmark: about 4.4GB total used, with about 11.6GB free

For long TED videos, expect the first run to pay the model load cost once; subsequent transcriptions in the same process run much faster.

## Verified Local Demo

The generated local test video completed successfully:

```powershell
.\.venv\Scripts\python.exe -m ai_runtime.cli run --video .\outputs\diagnostics\demo.mp4 --output-root outputs\runs --whisper-language auto --summary-language English
```

Verified outputs:

- `outputs/runs/demo-20260529-023752-9b8e2250/transcript.txt`
- `outputs/runs/demo-20260529-023752-9b8e2250/subtitles.srt`
- `outputs/runs/demo-20260529-023752-9b8e2250/summary.md`
