FROM node:24-slim

# システム依存: ffmpeg, yt-dlp, unzip
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg unzip python3 curl ca-certificates \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# 依存インストール & ビルド
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# データディレクトリ (ボリュームマウント用)
RUN mkdir -p /app/data /app/data/hls /app/data/overlay /app/data/cache /app/data/uploads

EXPOSE 3000

CMD ["pnpm", "start"]
