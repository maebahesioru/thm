// YouTubeチャンネル・ハッシュタグから全動画リストを取得 (yt-dlp経由、キャッシュ付き)
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { CACHE_DIR, config } from "./config";

const run = promisify(execFile);

export type YtVideo = {
  id: string;
  title: string;
  durationSec: number;
  channelTitle?: string;
};

function ytdlpArgs(): string[] {
  const args = [
    "--no-update", "--no-playlist", "--flat-playlist",
    "--dump-json", "--js-runtimes", "node", "--remote-components", "ejs:github",
  ];
  if (config.youtubeCookies && fs.existsSync(config.youtubeCookies)) {
    args.push("--cookies", config.youtubeCookies);
  }
  return args;
}

export async function fetchChannelVideos(handle: string, label: string): Promise<YtVideo[]> {
  return fetchYtPlaylist(`https://www.youtube.com/${handle}/videos`, label, `yt_channel_${handle.replace(/[/@]/g, "_")}`);
}

export async function fetchHashtagVideos(tag: string): Promise<YtVideo[]> {
  // ytsearchでハッシュタグ検索 (最大10000件)
  return fetchYtPlaylist(`ytsearch10000:#${tag}`, `#${tag}`, `yt_hashtag_${tag}`);
}

async function fetchYtPlaylist(url: string, label: string, cacheKey: string): Promise<YtVideo[]> {
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
  const cacheAge = 6 * 60 * 60 * 1000;

  try {
    const stat = fs.statSync(cachePath);
    if (Date.now() - stat.mtimeMs < cacheAge) return JSON.parse(fs.readFileSync(cachePath, "utf-8")) as YtVideo[];
  } catch {}

  try {
    const { stdout } = await run("yt-dlp", [...ytdlpArgs(), url], {
      maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000,
    });
    const videos: YtVideo[] = [];
    for (const line of stdout.trim().split("\n")) {
      if (!line) continue;
      try {
        const j = JSON.parse(line) as { id?: string; title?: string; duration?: number; channel?: string };
        if (j.id && j.title) {
          videos.push({
            id: j.id, title: j.title,
            durationSec: typeof j.duration === "number" ? j.duration : 600,
            channelTitle: j.channel || label,
          });
        }
      } catch {}
    }
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(videos), "utf-8");
    console.log(`[youtube] ${label}: ${videos.length} videos cached`);
    return videos;
  } catch (e) {
    console.error(`[youtube] fetch failed for ${label}:`, (e as Error).message?.slice(0, 200));
    try { return JSON.parse(fs.readFileSync(cachePath, "utf-8")) as YtVideo[]; } catch { return []; }
  }
}

// 全チャンネル + 全ハッシュタグの動画プール
let fullPoolCache: { videos: YtVideo[]; fetchedAt: number } | null = null;

export async function getFullYoutubePool(
  channels: Array<{ handle: string; label: string }>,
  hashtags: string[],
): Promise<YtVideo[]> {
  if (fullPoolCache && Date.now() - fullPoolCache.fetchedAt < 30 * 60 * 1000) {
    return fullPoolCache.videos;
  }
  const all: YtVideo[] = [];
  for (const ch of channels) {
    const vids = await fetchChannelVideos(ch.handle, ch.label);
    for (const v of vids) if (!v.channelTitle) v.channelTitle = ch.label;
    all.push(...vids);
  }
  for (const tag of hashtags) {
    const vids = await fetchHashtagVideos(tag);
    all.push(...vids);
  }
  fullPoolCache = { videos: all, fetchedAt: Date.now() };
  console.log(`[youtube] full pool: ${all.length} videos (${channels.length} channels + ${hashtags.length} hashtags)`);
  return all;
}
