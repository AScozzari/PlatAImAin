FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libsndfile1 libportaudio2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV XTTS_ENABLED=true
ENV XTTS_MODEL_PATH=/models/tts/xtts-v2
ENV KOKORO_ENABLED=true
ENV KOKORO_MODEL_PATH=/models/tts/kokoro-v1
ENV STYLETT2_ENABLED=false
ENV STYLETT2_MODEL_PATH=/models/tts/stylett2-en
ENV VOICES_PATH=/data/voices
ENV PORT=8020

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT} --workers 1"]
