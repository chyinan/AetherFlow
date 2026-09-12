FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
ENV ENABLE_LLM=true
ENV ENABLE_WHISPER=true
WORKDIR /app

RUN sed -i 's|http://deb.debian.org/debian|https://deb.debian.org/debian|g; s|http://deb.debian.org/debian-security|https://deb.debian.org/debian-security|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::Retries=5 update \
    && apt-get -o Acquire::Retries=5 install -y --no-install-recommends ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r app && useradd -r -g app app

COPY python-ai-service/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY python-ai-service/app /app/app
RUN chown -R app:app /app

USER app
EXPOSE 8200
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8200"]

