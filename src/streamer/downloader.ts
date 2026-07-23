import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { CACHE_DIR, config } from "../lib/config";

const run = promisify(execFile);

export function ensureDirs() {
  for (const d of [CACHE_DIR]) fs.mkdirSync(d, { recursive: true });
}

export function ytDlpBaseArgs(service: "youtube" | "niconico"): string[] {
  const args = [
    "--no-update",
    "--no-playlist",
    "--no-progress",
    "--retries",
    "3",
    "--live-from-start",
    // YouTubeのnチャレンジ対策 (nodeをJSランタイムとして利用)
    "--js-runtimes",
    "node",
    "--remote-components",
    "ejs:github",
  ];
  const cookies = service === "niconico" ? config.nicoCookies : config.youtubeCookies;
  if (cookies && fs.existsSync(cookies)) {
    args.push("--cookies", cookies);
  }
  return args;
}

// 動画をダウンロードしてローカルファイルパスを返す (失敗時null)
export async function downloadVideo(
  sourceType: string,
  sourceId: string,
): Promise<string | null> {
  ensureDirs();
  if (sourceType === "local") {
    return fs.existsSync(sourceId) ? sourceId : null;
  }
  const key = sourceType === "youtube" ? `yt_${sourceId}` : `nico_${sourceId}`;
  const out = path.join(CACHE_DIR, `${key}.mp4`);
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return out;

  const url =
    sourceType === "youtube"
      ? `https://www.youtube.com/watch?v=${sourceId}`
      : `https://www.nicovideo.jp/watch/${sourceId}`;

  if (sourceType === "niconico" && !config.nicoCookies) {
    console.log(`[downloader] NICO_COOKIES 未設定のため ${sourceId} のダウンロードをスキップ`);
    return null;
  }

  const tmp = path.join(CACHE_DIR, `${key}.part.mp4`);
  try {
    console.log(`[downloader] downloading ${url}`);
    await run(
      "yt-dlp",
      [
        ...ytDlpBaseArgs(sourceType === "youtube" ? "youtube" : "niconico"),
        "-f",
        "bv*[height<=1080]+ba/bv*[height<=1080]/b[height<=1080]/b",
        "--merge-output-format",
        "mp4",
        "-o",
        tmp,
        url,
      ],
      { maxBuffer: 16 * 1024 * 1024, timeout: 30 * 60 * 1000 },
    );
    if (fs.existsSync(tmp)) {
      fs.renameSync(tmp, out);
      return out;
    }
    // yt-dlpが拡張子を変えた場合のフォールバック
    const cand = fs.readdirSync(CACHE_DIR).find((f) => f.startsWith(`${key}.part`));
    if (cand) {
      fs.renameSync(path.join(CACHE_DIR, cand), out);
      return out;
    }
    return null;
  } catch (e) {
    console.error(`[downloader] failed ${url}:`, (e as Error).message?.slice(0, 500));
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {}
    return null;
  }
}

// ニコニコのコメントを取得 (nv-comment API直接利用。yt-dlpはニコニココメント非対応のため)
export type { NicoComment } from "../lib/niconico-comments";
import { fetchNicoComments, type NicoComment } from "../lib/niconico-comments";

export async function downloadComments(nicoId: string, durationSec: number): Promise<NicoComment[]> {
  return fetchNicoComments(nicoId, durationSec);
}
