FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
ENV ENABLE_LLM=true
ENV ENABLE_WHISPER=true
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r app && useradd -r -g app app

COPY python-ai-service/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY python-ai-service/app /app/app
RUN chown -R app:app /app

USER app
EXPOSE 8200
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8200"]

