import path from "path";

export const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, "data");
export const HLS_DIR = path.join(DATA_DIR, "hls");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export const CACHE_DIR = path.join(DATA_DIR, "cache");
export const OVERLAY_DIR = path.join(DATA_DIR, "overlay");

export const config = {
  adminPassword: process.env.ADMIN_PASSWORD || "thm-dev-password",
  authSecret: process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || "thm-dev-password",
  streamMode: (process.env.STREAM_MODE || "hls") as "hls" | "rtmp" | "simulate",
  youtubeStreamKey: process.env.YOUTUBE_STREAM_KEY || "",
  youtubeChannelId: process.env.YOUTUBE_CHANNEL_ID || "",
  youtubeLiveVideoId: process.env.YOUTUBE_LIVE_VIDEO_ID || "",
  nicoCookies: process.env.NICO_COOKIES || "",
  youtubeCookies: process.env.YT_COOKIES || "",
  youtubePollIntervalSec: Number(process.env.YOUTUBE_POLL_INTERVAL_SEC || 60),
  scheduleHorizonHours: Number(process.env.SCHEDULE_HORIZON_HOURS || 24),
  replayNgDays: Number(process.env.REPLAY_NG_DAYS || 7),
};

// 割り込み監視対象のYouTubeチャンネル
export const WATCH_CHANNELS = [
  { handle: "@HikakinTV", label: "HikakinTV" },
  { handle: "@HikakinGames", label: "HikakinGames" },
  { handle: "@SeikinTV", label: "SeikinTV" },
  { handle: "@SeikinGames", label: "SeikinGames" },
];

// ニコニコタグ一覧 (ユーザー提供)
export const ALL_TAGS = [
  "hikakin_mania",
  "Hikakin_Mania_Mania",
  "ヒカマニCMリンク",
  "ヒカマニ外伝リンク",
  "ヒカマニ歌唱リンク",
  "ヒカマニ改変リンク",
  "ヒカマニ休日リンク",
  "ヒカマニ講座リンク",
  "ヒカマニ安全地帯リンク",
  "ヒカマニ抜ける商品リンク",
  "ヒカマニ元ネタ外伝リンク",
  "ヒカマニゲーム紹介リンク",
  "ヒカマニレアキャラリンク",
  "ヒカマニ公式レアキャラリンク",
  "ヒカマニ",
  "教育ヒカマニ",
  "公式ヒカマニ",
  "名作ヒカマニ",
  "大腸編ヒカマニ",
  "バトルヒカマニ",
  "社会派ヒカマニ",
  "ひとくちヒカマニ",
  "ヒカマニ危険地帯",
  "全年齢向けヒカマニ",
  "フリースタイルヒカマニ",
  "数学マニア",
  "ヒカニチ",
  "ヒカニチmad",
  "ヒカマー",
  "メダカガニ",
  "ヒカマーmadリンク",
  "ヒカマー素材リンク",
  "クラウド(ヒカマー)",
  "ゲイマスオ",
  "Masuo_MAD",
  "一発ゲイマスオ",
  "ゲイゲイマスオ",
  "作業用ゲイマスオ",
  "ゲイマスオ極速編",
  "ゲイおてんばゲイマスオ",
  "ボイパ対決",
  "ボイパ対決シリーズ",
  "sm666ボイパ対決シリーズ",
  "HIKAKINボイパ対決シリーズ",
];

export const CM_TAG = "ヒカマニCMリンク";

// 時間帯別チャンネル編成 (JST)
export type Band = {
  id: string;
  label: string;
  // [startHour, endHour) JST
  range: [number, number];
  tags: string[];
  cmCount: number; // 番組間に挿入するCM本数
};

export const BANDS: Band[] = [
  {
    id: "midnight",
    label: "深夜帯",
    range: [0, 5],
    tags: ["ヒカマニ危険地帯", "大腸編ヒカマニ"],
    cmCount: 1,
  },
  {
    id: "morning",
    label: "朝",
    range: [5, 11],
    tags: ["教育ヒカマニ", "全年齢向けヒカマニ"],
    cmCount: 1,
  },
  {
    id: "noon",
    label: "昼",
    range: [11, 15],
    tags: ["ひとくちヒカマニ"],
    cmCount: 2,
  },
  {
    id: "evening",
    label: "夕方",
    range: [15, 19],
    tags: ["ヒカマニ", "社会派ヒカマニ", "フリースタイルヒカマニ", "公式ヒカマニ"],
    cmCount: 1,
  },
  {
    id: "golden",
    label: "ゴールデン",
    range: [19, 23],
    tags: ["名作ヒカマニ", "バトルヒカマニ"],
    cmCount: 1,
  },
  {
    id: "latenight",
    label: "深夜帯",
    range: [23, 24],
    tags: ["ヒカマニ危険地帯", "大腸編ヒカマニ"],
    cmCount: 1,
  },
];

// タグで動画が見つからなかった場合のフォールバック (全タグ)
export const FALLBACK_TAGS = ALL_TAGS;

export function jstHour(d: Date = new Date()): number {
  return (d.getUTCHours() + 9) % 24;
}

export function bandFor(d: Date): Band {
  const h = jstHour(d);
  return BANDS.find((b) => h >= b.range[0] && h < b.range[1]) ?? BANDS[0];
}
