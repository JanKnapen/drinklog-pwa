FROM node:20-alpine AS builder
WORKDIR /app
COPY admin/frontend/package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,id=admin-frontend-node-modules,target=/app/node_modules \
    npm install --prefer-offline
COPY admin/frontend/ .
RUN --mount=type=cache,id=admin-frontend-node-modules,target=/app/node_modules \
    npm run build:docker

FROM nginxinc/nginx-unprivileged:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY --chown=nginx:nginx admin/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
