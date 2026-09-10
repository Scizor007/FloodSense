FROM python:3.11-slim

WORKDIR /app

# Install system build dependencies for scikit-learn / numpy
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY . .

# Ensure uploads folder exists
RUN mkdir -p uploads

ENV PORT=8000
ENV HOST=0.0.0.0

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
