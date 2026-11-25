# One image serves everything: FastAPI (API + built Angular app). Build: docker build -t carrental-carleaseapp .
FROM node:24-slim AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=web /web/dist/frontend/browser /app/frontend/dist/frontend/browser
ENV STATIC_DIR=/app/frontend/dist/frontend/browser
RUN useradd -r -u 10001 app
USER app
EXPOSE 8000
# Shell form so ${PORT} (injected by Render/Railway/Fly) is expanded; defaults to 8000.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips "*"
