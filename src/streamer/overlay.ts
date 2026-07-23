import fs from "fs";
import path from "path";
import { OVERLAY_DIR } from "../lib/config";
import type { NicoComment } from "./downloader";

export function ensureOverlayDirs() {
  fs.mkdirSync(OVERLAY_DIR, { recursive: true });
}

export const TICKER_FILE = path.join(OVERLAY_DIR, "ticker.txt");
export const TITLE_FILE = path.join(OVERLAY_DIR, "title.txt");

export function writeTickerFile(text: string) {
  ensureOverlayDirs();
  fs.writeFileSync(TICKER_FILE, text, "utf-8");
}

export function writeTitleFile(text: string) {
  ensureOverlayDirs();
  fs.writeFileSync(TITLE_FILE, text, "utf-8");
}

// ffmpegフィルタ内で使えるようパスをエスケープ
export function ffPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

export function findFont(bold = false): string | null {
  const candidates = process.platform === "win32"
    ? (bold
        ? ["C:/Windows/Fonts/BIZ-UDGothicB.ttc", "C:/Windows/Fonts/meiryo.ttc", "C:/Windows/Fonts/msgothic.ttc"]
        : ["C:/Windows/Fonts/BIZ-UDGothicR.ttc", "C:/Windows/Fonts/meiryo.ttc", "C:/Windows/Fonts/msgothic.ttc"])
    : (bold
        ? ["/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc"]
        : ["/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"]);
  for (const f of candidates) if (fs.existsSync(f)) return f;
  return null;
}

function assTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const cs = Math.floor((s - Math.floor(s)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function assEscape(text: string): string {
  // 絵文字・特殊記号を除去 (フォント非対応の文字)
  const cleaned = text.replace(/[^\x00-\x7F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF 　！-～0-9a-zA-Z]/g, "");
  return cleaned.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\n/g, "\\N");
}

// ニコニココメント -> 右から左へ流れるASS字幕 (位置・色・サイズ対応)
export function writeCommentsAss(comments: NicoComment[], durationSec: number, outPath: string): boolean {
  ensureOverlayDirs();
  if (comments.length === 0) return false;

  const font = findFont(false) ?? "Meiryo";
  const fontName = process.platform === "win32"
    ? (font.split("/").pop()?.replace(/\.tt[cf]$/i, "") ?? "Meiryo")
    : "Noto Sans CJK JP";
  const baseFontSize = 44;

  // 色マップ (ASSは BBGGRR)
  const COLOR_MAP: Record<string, string> = {
    white: "&H00FFFFFF&", red: "&H000000FF&", pink: "&H00FFA0FF&",
    orange: "&H0000A5FF&", yellow: "&H0000FFFF&", green: "&H0000FF00&",
    cyan: "&H00FFFF00&", blue: "&H00FF0000&", purple: "&H00800080&", black: "&H00000000&",
  };

  // 位置ごとのレーン範囲 (全10レーンを3ゾーンに分割)
  const ZONES: Record<string, [number, number]> = {
    ue: [0, 3], naka: [4, 7], shita: [8, 9],
  };
  const LANE_H = 56;
  const TOP = 8;
  const SPEED_HOLD = 6;
  const zoneFreeUntil: Record<string, number[]> = {
    ue: [0, 0, 0, 0],
    naka: [0, 0, 0, 0],
    shita: [0, 0],
  };

  const lines: string[] = [];
  for (const c of comments) {
    if (c.sec > durationSec) continue;
    const zone = ZONES[c.position ?? "naka"] ?? ZONES.naka;
    const lanes = zoneFreeUntil[c.position ?? "naka"];
    let li = lanes.findIndex((t) => t <= c.sec);
    if (li < 0) li = Math.floor(Math.random() * (zone[1] - zone[0] + 1));
    lanes[li] = c.sec + 2.0;
    const lane = zone[0] + li;
    const y = TOP + lane * LANE_H + LANE_H / 2;

    // サイズタグ
    const fs = c.size === "big" ? Math.round(baseFontSize * 1.4) : c.size === "small" ? Math.round(baseFontSize * 0.7) : baseFontSize;
    // 色タグ
    const colorTag = c.color && COLOR_MAP[c.color] ? `\\c${COLOR_MAP[c.color]}` : "";

    const start = assTime(c.sec);
    const end = assTime(Math.min(c.sec + SPEED_HOLD, durationSec));
    const text = assEscape(c.text);
    lines.push(
      `Dialogue: 0,${start},${end},Comment,,0,0,0,,{\\move(2100,${y},-300,${y})\\fs${fs}${colorTag}}${text}`,
    );
  }

  const ass = `[Script Info]
Title: THM niconico comments
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Comment,${fontName},36,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines.join("\n")}
`;
  fs.writeFileSync(outPath, ass, "utf-8");
  return true;
}

export function commentsAssPath(programId: string): string {
  return path.join(OVERLAY_DIR, `comments_${programId}.ass`);
}
