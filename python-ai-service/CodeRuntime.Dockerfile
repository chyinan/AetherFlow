# syntax=docker/dockerfile:1
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

RUN groupadd -r app && useradd -r -g app -d /app -s /usr/sbin/nologin app

COPY python-ai-service/requirements-code-runtime.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

RUN mkdir -p /app/app
COPY python-ai-service/app/main.py /app/app/main.py
COPY python-ai-service/app/code_runtime_main.py /app/app/code_runtime_main.py
RUN chown -R app:app /app

USER app
EXPOSE 8300
CMD ["uvicorn", "app.code_runtime_main:app", "--host", "0.0.0.0", "--port", "8300", "--workers", "1"]
