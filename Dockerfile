FROM node:20-alpine AS frontend-build
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    FRONTEND_DIST=/app/frontend/dist
WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --system --create-home --shell /usr/sbin/nologin instamate \
    && mkdir -p /data
COPY --chown=instamate:instamate backend/instamate ./instamate
COPY --from=frontend-build --chown=instamate:instamate /build/frontend/dist ./frontend/dist
RUN chown -R instamate:instamate /data
USER instamate
EXPOSE 8000
CMD ["uvicorn", "instamate.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
