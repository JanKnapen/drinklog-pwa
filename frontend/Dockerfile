FROM node:20-alpine AS builder
WORKDIR /app
COPY frontend/package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,id=frontend-node-modules,target=/app/node_modules \
    npm install --prefer-offline
COPY frontend/ .
RUN --mount=type=cache,id=frontend-node-modules,target=/app/node_modules \
    npm run build:docker

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
