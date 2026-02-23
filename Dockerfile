# Frontend Dockerfile
FROM node:22-alpine AS deps

RUN npm install -g pnpm@9

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

# Build stage
FROM node:22-alpine AS builder

RUN npm install -g pnpm@9

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG VITE_GOOGLE_CLIENT_ID=""
ARG VITE_GOOGLE_CLIENT_SECRET=""
ARG VITE_RPC_URL=""

RUN pnpm build

RUN ls -la /app/dist && test -f /app/dist/index.html

# Production stage
FROM nginx:alpine AS runner

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

RUN ls -la /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
