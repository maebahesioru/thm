FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg python3 curl ca-certificates fonts-noto-cjk fonts-noto-color-emoji \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma/ ./prisma/
RUN pnpm install

COPY . .
RUN npx prisma db push --skip-generate
RUN npx next build

RUN mkdir -p /app/data

EXPOSE 3000

CMD sh -c "npx prisma db push --skip-generate && pnpm start"
