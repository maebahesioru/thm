FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg python3 curl ca-certificates fonts-noto-cjk fonts-noto-color-emoji \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# 絵文字フォントをfontconfigに登録 (libassが使えるように)
RUN echo '<?xml version="1.0"?>' > /etc/fonts/conf.d/99-emoji.conf && \
    echo '<!DOCTYPE fontconfig SYSTEM "fonts.dtd">' >> /etc/fonts/conf.d/99-emoji.conf && \
    echo '<fontconfig>' >> /etc/fonts/conf.d/99-emoji.conf && \
    echo '  <alias><family>sans-serif</family><prefer><family>Noto Color Emoji</family></prefer></alias>' >> /etc/fonts/conf.d/99-emoji.conf && \
    echo '</fontconfig>' >> /etc/fonts/conf.d/99-emoji.conf && \
    fc-cache -f

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
