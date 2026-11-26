FROM node:24-bookworm-slim AS node
FROM python:3.12-slim-bookworm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY collector.py .
COPY vendor ./vendor
ENV PYTHONUNBUFFERED=1 STATE_DIR=/data MAX_SECONDS=600 MAX_NEW=20
CMD ["python", "collector.py"]
