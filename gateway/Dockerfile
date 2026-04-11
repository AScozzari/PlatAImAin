FROM python:3.11-slim

# System dependencies: ffmpeg for audio conversion, libsndfile1 for audio I/O
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    libsndfile1-dev \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first for Docker layer cache
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# StyleTTS2 (not on PyPI — install from git)
# Uncomment when needed:
# RUN pip install --no-cache-dir git+https://github.com/yl4579/StyleTTS2.git

COPY . .

# Create non-root user
RUN useradd -m -u 1000 gateway && chown -R gateway:gateway /app
USER gateway

# Single worker: required for Type B singleton model wrappers
# Multiple workers would load TTS models N times, exhausting VRAM
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--log-level", "info"]
