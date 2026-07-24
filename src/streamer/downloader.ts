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
  if (sourceType === "booru") {
    const key = `booru_${sourceId.replace(/[^a-zA-Z0-9]/g, "_").slice(-60)}`;
    const out = path.join(CACHE_DIR, `${key}.mp4`);
    if (fs.existsSync(out) && fs.statSync(out).size > 0) return out;
    try {
      console.log(`[downloader] downloading booru: ${sourceId}`);
      await run("yt-dlp", [...ytDlpBaseArgs("youtube"), "-o", out, sourceId], {
        maxBuffer: 16 * 1024 * 1024, timeout: 30 * 60 * 1000,
      });
      return fs.existsSync(out) ? out : null;
    } catch (e) {
      console.error(`[downloader] booru failed:`, (e as Error).message?.slice(0, 200));
      return null;
    }
  }

  // YouTube/ニコニコ: まずCookie付きで試し、ダメならCookieなし
  const key = sourceType === "youtube" ? `yt_${sourceId}` : `nico_${sourceId}`;
  const out = path.join(CACHE_DIR, `${key}.mp4`);
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return out;

  const url = sourceType === "youtube"
    ? `https://www.youtube.com/watch?v=${sourceId}`
    : `https://www.nicovideo.jp/watch/${sourceId}`;

  // Try with cookies first
  let result = await tryDownload(sourceType, url, out);
  // If failed and we used cookies, try without
  if (!result && sourceType === "youtube" && config.youtubeCookies && fs.existsSync(config.youtubeCookies)) {
    console.log(`[downloader] cookie download failed, retrying without cookies`);
    result = await tryDownload(sourceType, url, out, true);
  }
  return result;
}

async function tryDownload(
  sourceType: string,
  url: string,
  out: string,
  noCookies = false,
): Promise<string | null> {
  const tmp = path.join(CACHE_DIR, `${path.basename(out, ".mp4")}.part.mp4`);
  const args = [...ytDlpBaseArgs(sourceType === "youtube" ? "youtube" : "niconico")];
  if (noCookies) {
    // Remove cookies argument
    for (let i = args.length - 1; i >= 0; i--) {
      if (args[i] === "--cookies") { args.splice(i, 2); break; }
    }
  }
  try {
    console.log(`[downloader] downloading ${url}`);
    await run(
      "yt-dlp",
      [
        ...args,
        "-f",
        "bv*[height<=720]+ba/bv*[height<=720]/b[height<=720]/b",
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
    for (const f of fs.readdirSync(CACHE_DIR)) {
      if (f.startsWith(path.basename(out, ".mp4")) && f.endsWith(".mp4") && f !== path.basename(out)) {
        fs.renameSync(path.join(CACHE_DIR, f), out);
        return out;
      }
    }
    return null;
  } catch (e) {
    console.error(`[downloader] failed ${url}:`, (e as Error).message?.slice(0, 500));
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
    return null;
  }
}

// ニコニコのコメントを取得 (nv-comment API直接利用。yt-dlpはニコニココメント非対応のため)
export type { NicoComment } from "../lib/niconico-comments";
import { fetchNicoComments, type NicoComment } from "../lib/niconico-comments";

export async function downloadComments(nicoId: string, durationSec: number): Promise<NicoComment[]> {
  return fetchNicoComments(nicoId, durationSec);
}
