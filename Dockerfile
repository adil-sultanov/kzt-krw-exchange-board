# Production image: the built frontend plus the API, bot and jobs in one process.
# See docker-compose.yml and the README's Deploy section.

FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
RUN useradd --system --no-create-home --shell /usr/sbin/nologin app
WORKDIR /app
COPY backend/ /tmp/backend/
RUN pip install /tmp/backend && rm -rf /tmp/backend
COPY --from=frontend /frontend/dist /app/frontend/dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
ENV FRONTEND_DIST=/app/frontend/dist \
    DB_PATH=/data/exchange.db \
    BACKUP_DIR=/backups
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"]
ENTRYPOINT ["docker-entrypoint.sh"]
# One worker only: bot polling, the scheduler and the SQLite write lock assume one process.
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips", "*"]
