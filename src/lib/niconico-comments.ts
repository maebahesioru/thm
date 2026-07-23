// ニコニコ動画のコメント取得 (nv-comment API直接利用、Cookie必須)
// watchページHTML内の <meta name="server-response"> に埋め込まれたJSONから
// threadKey/threadIds/serverを取得し、nv-comment APIへPOST
import fs from "fs";
import { config } from "./config";

export type NicoComment = {
  sec: number;
  text: string;
  // ニコニコの装飾コマンド (位置・色・サイズ)
  color?: string;   // white/red/pink/orange/yellow/green/cyan/blue/purple/black
  position?: string; // ue(上)/naka(中)/shita(下)  default: naka
  size?: string;     // big/small  default: medium
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function loadCookieHeader(path: string): string {
  const lines = fs.readFileSync(path, "utf-8").split(/\r?\n/);
  const pairs: string[] = [];
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const cols = line.split("\t");
    if (cols.length < 7) continue;
    pairs.push(`${cols[5]}=${cols[6]}`);
  }
  return pairs.join("; ");
}

function htmlDecode(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

async function fetchCommentMeta(videoId: string, cookie: string) {
  const res = await fetch(`https://www.nicovideo.jp/watch/${videoId}`, {
    headers: { "User-Agent": UA, Cookie: cookie },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(/<meta name="server-response" content="([^"]+)"/);
  if (!m) return null;
  try {
    const json = JSON.parse(htmlDecode(m[1])) as Record<string, unknown>;
    const resp = (json.data as Record<string, unknown>)?.response as Record<string, unknown>;
    const cm = resp?.comment as Record<string, unknown>;
    const nv = cm?.nvComment as { threadKey?: string; server?: string; params?: { targets?: Array<{ id?: string; fork?: string }>; language?: string } } | undefined;
    return nv ?? null;
  } catch {
    return null;
  }
}

export async function fetchNicoComments(videoId: string, durationSec: number): Promise<NicoComment[]> {
  if (!config.nicoCookies || !fs.existsSync(config.nicoCookies)) return [];
  try {
    const cookie = loadCookieHeader(config.nicoCookies);
    const nv = await fetchCommentMeta(videoId, cookie);
    if (!nv?.threadKey || !nv.server) {
      console.log(`[niconico] ${videoId}: コメントメタデータなし`);
      return [];
    }

    const res = await fetch(`${nv.server}/v1/threads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        "x-frontend-id": "6",
        "x-frontend-version": "0",
        Referer: `https://www.nicovideo.jp/watch/${videoId}`,
        Origin: "https://www.nicovideo.jp",
        Cookie: cookie,
      },
      body: JSON.stringify({
        params: nv.params ?? { targets: [], language: "ja-jp" },
        threadKey: nv.threadKey,
        additionals: {},
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.log(`[niconico] ${videoId}: コメントAPI ${res.status}`);
      return [];
    }
    const json = (await res.json()) as {
      data?: { threads?: Array<{ comments?: Array<{ content?: string; vposMs?: number; body?: string; commands?: string[] }> }> };
    };
    const threads = json.data?.threads ?? [];
    // APIは targets 順のスレッドを返す。owner(空)ではなく main を優先、コメント数の多い方を取る
    const best = threads.reduce((best, t) => (t.comments ?? []).length > (best.comments ?? []).length ? t : best, { comments: [] });
    const out: NicoComment[] = [];
    for (const c of best.comments ?? []) {
      const text = (c.content ?? c.body ?? "").trim();
      if (!text || c.vposMs == null) continue;
      const sec = c.vposMs / 1000; // vposMsはミリ秒
      if (sec < 0 || sec > durationSec + 30) continue;
      const cmds = c.commands ?? [];
      const color = cmds.find((x) => /^(white|red|pink|orange|yellow|green|cyan|blue|purple|black)$/i.test(x))?.toLowerCase();
      const position = cmds.find((x) => /^(ue|naka|shita)$/i.test(x))?.toLowerCase() || "naka";
      const size = cmds.find((x) => /^(big|small)$/i.test(x))?.toLowerCase();
      out.push({ sec, text, color: color ?? undefined, position, size: size ?? undefined });
    }
    out.sort((a, b) => a.sec - b.sec);
    console.log(`[niconico] ${videoId}: ${out.length}件のコメントを取得`);
    return out;
  } catch (e) {
    console.error(`[niconico] ${videoId}: コメント取得失敗:`, (e as Error).message);
    return [];
  }
}
