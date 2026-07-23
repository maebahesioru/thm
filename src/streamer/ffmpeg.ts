import { spawn, execFile, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { HLS_DIR, OVERLAY_DIR, config } from "../lib/config";
import { ffPath, findFont, TICKER_FILE, TITLE_FILE } from "./overlay";

export type PlayRequest = {
  inputFile?: string;
  placeholderTitle?: string;
  placeholderColor?: string;
  offsetSec?: number;
  durationSec: number;
  commentsAss?: string | null;
  noTicker?: boolean;
  // 速報音声 (再生開始時に1回だけ主音声にミックスされる)
  alertSound?: string;
};

export type PlayHandle = {
  proc: ChildProcess | null;
  done: Promise<{ completed: boolean; elapsedSec: number }>;
  stop: () => void;
};

const RTMP_URL = () => `rtmps://a.rtmp.youtube.com/live2/${config.youtubeStreamKey}`;

// 上部タイトルバー (番組名 / textfileで動的更新)
function buildTitleBar(): string | null {
  const font = findFont(true);
  if (!font) return null;
  const f = ffPath(font);
  const tf = ffPath(TITLE_FILE);
  return [
    `drawbox=x=0:y=0:w=iw:h=56:color=black@0.7:t=fill`,
    `drawtext=fontfile='${f}':textfile='${tf}':reload=1:fontsize=32:fontcolor=white:borderw=0:x=16:y=40`,
  ].join(",");
}

// 右上時計 (テレビ風 / localtimeでリアルタイム更新)
function buildClock(): string | null {
  const font = findFont(true);
  if (!font) return null;
  const f = ffPath(font);
  return [
    `drawbox=x=w-130:y=58:w=122:h=46:color=black@0.7:t=fill`,
    `drawtext=fontfile='${f}':text='%{localtime\\:%H.%M}':` +
      `fontsize=28:fontcolor=white:borderw=0:x=w-120:y=90`,
  ].join(",");
}

// TV風テロップ (下部帯 + 赤ラベル + 右→左流れる文字、文字に半透明黒背景)
function buildTickerFilter(): string | null {
  const font = findFont(true);
  if (!font) return null;
  const f = ffPath(font);
  const tf = ffPath(TICKER_FILE);
  // 帯全体: 黒半透明 / ラベル: 赤い"THM" / 本文: 白字スクロール
  return [
    // 細い赤ライン
    `drawbox=x=0:y=h-62:w=iw:h=2:color=red@0.9:t=fill`,
    // テロップ背景帯 (黒半透明, 全幅, 高さ60px)
    `drawbox=x=0:y=h-60:w=iw:h=60:color=black@0.85:t=fill`,
    // ラベル背景 (赤, 左端 幅100px)
    `drawbox=x=0:y=h-60:w=100:h=60:color=red@0.95:t=fill`,
    // ラベル文字 "THM"
    `drawtext=fontfile='${f}':text='THM':fontsize=30:fontcolor=white:x=14:y=h-26`,
    // テロップ本文 (大きく、黒背景付きでスクロール)
    `drawtext=fontfile='${f}':textfile='${tf}':reload=1:` +
      `fontsize=40:fontcolor=white:borderw=0:` +
      `box=1:boxcolor=black@0.6:boxborderw=6:` +
      `x=w-mod(t*160\\,w+tw+120):y=h-36`,
  ].join(",");
}

function buildPlaceholderInput(title: string, color: string): { args: string[]; labelFilter: string | null } {
  const font = findFont();
  const args = [
    "-re", // lavfi入力も実時間ペースにする (これが無いと最速エンコードで瞬時に終了する)
    "-f",
    "lavfi",
    "-i",
    `color=c=${color}:size=1920x1080:rate=60`,
    "-re",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
  ];
  let labelFilter: string | null = null;
  if (font) {
    const safe = title.replace(/['\\:,%[\]]/g, " ");
    labelFilter =
      `drawtext=fontfile='${ffPath(font)}':text='${safe}':fontsize=44:fontcolor=white:` +
      `x=(w-text_w)/2:y=(h-text_h)/2:borderw=2:bordercolor=black`;
  }
  return { args, labelFilter };
}

function buildOutputArgs(): string[] {
  if (config.streamMode === "rtmp") {
    return ["-f", "flv", RTMP_URL()];
  }
  fs.mkdirSync(HLS_DIR, { recursive: true });

  // 既存セグメントの最大番号を取得し、番組切替でも番号を継続させる
  let maxNum = 0;
  try {
    for (const f of fs.readdirSync(HLS_DIR)) {
      const m = f.match(/^seg_(\d+)\.ts$/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }
  } catch {}

  return [
    "-f",
    "hls",
    "-hls_time",
    "4",
    "-hls_list_size",
    "30",
    "-hls_flags",
    "delete_segments+omit_endlist",
    "-start_number",
    String(maxNum + 1),
    "-hls_segment_filename",
    path.join(HLS_DIR, "seg_%05d.ts"),
    path.join(HLS_DIR, "index.m3u8"),
  ];
}

// ffmpegで1ユニット再生。完了/中断でresolve。
export function play(req: PlayRequest): PlayHandle {
  const startedAt = Date.now();

  if (config.streamMode === "simulate") {
    let timer: NodeJS.Timeout | null = null;
    let stopped = false;
    const done = new Promise<{ completed: boolean; elapsedSec: number }>((resolve) => {
      timer = setTimeout(() => resolve({ completed: true, elapsedSec: req.durationSec }), req.durationSec * 1000);
      void stopped;
    });
    return {
      proc: null,
      done,
      stop: () => {
        stopped = true;
        if (timer) clearTimeout(timer);
      },
    };
  }

  const args: string[] = ["-hide_banner", "-loglevel", "warning", "-y"];

  const filters: string[] = [];
  let mapArgs: string[];

  let needComplexFilter = false;
  let audioMixLabel: string | null = null; // "0:a" for file, "1:a" for placeholder

  if (req.inputFile) {
    if (req.offsetSec && req.offsetSec > 0.5) args.push("-ss", String(Math.floor(req.offsetSec)));
    args.push("-re", "-i", req.inputFile);
    mapArgs = ["-map", "0:v:0", "-map", "0:a:0?"];
    audioMixLabel = "0:a";
    filters.push(
      "scale=1920:1080:force_original_aspect_ratio=decrease",
      "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black",
      "setsar=1",
      "fps=60",
      "format=yuv420p",
    );
  } else {
    const ph = buildPlaceholderInput(req.placeholderTitle ?? "テレビヒカマニ", req.placeholderColor ?? "0x003366");
    args.push(...ph.args);
    mapArgs = ["-map", "0:v:0", "-map", "1:a:0"];
    audioMixLabel = "1:a";
    filters.push("format=yuv420p");
    if (ph.labelFilter) filters.push(ph.labelFilter);
  }

  if (req.commentsAss && fs.existsSync(req.commentsAss)) {
    filters.push(`subtitles='${ffPath(req.commentsAss)}'`);
  }
  if (!req.noTicker) {
    const clk = buildClock();
    if (clk) filters.push(clk);
  }
  if (!req.noTicker) {
    const t = buildTickerFilter();
    if (t) filters.push(t);
  }

  // 速報音声がある場合は filter_complex で音声ミックス
  const alertPath = req.alertSound && fs.existsSync(req.alertSound) ? req.alertSound : null;
  if (alertPath) {
    args.push("-i", alertPath);
    needComplexFilter = true;
  }

  const remaining = Math.max(1, Math.ceil(req.durationSec - (req.offsetSec ?? 0)));

  if (needComplexFilter && alertPath && audioMixLabel) {
    // filter_complex モード: 映像フィルタ + 速報音声ミックス
    const vf = filters.join(",");
    const alertIdx = req.inputFile ? "1:a" : "2:a";
      args.push(
        "-filter_complex",
        `[0:v]${vf}[outv];[${audioMixLabel}]volume=1[maina];[${alertIdx}]volume=2.5[alerta];[maina][alerta]amix=inputs=2:duration=first[outa]`,
        "-map", "[outv]", "-map", "[outa]",
      );
  } else {
    // 通常モード
    args.push(...mapArgs, "-vf", filters.join(","));
  }
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-b:v",
    "6000k",
    "-maxrate",
    "8000k",
    "-bufsize",
    "12000k",
    "-g",
    "120",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-t",
    String(remaining),
    ...buildOutputArgs(),
  );

  // stdinを開いておき、停止時は 'q' でクリーン終了させる (shim越しでも確実に効く)
  const proc = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
  proc.stderr?.on("data", (d) => {
    const line = d.toString().trim();
    if (line) {
      if (!line.startsWith("frame=")) console.log(`[ffmpeg] ${line.slice(0, 300)}`);
      // bitrate統計をファイルに書き出し (管理画面用)
      if (line.startsWith("frame=")) {
        const m: Record<string, string> = {};
        for (const p of line.split(/\s+/)) {
          const eq = p.indexOf("=");
          if (eq > 0) m[p.slice(0, eq)] = p.slice(eq + 1);
        }
        try { fs.writeFileSync(path.join(OVERLAY_DIR, "ffstats.json"), JSON.stringify(m), "utf-8"); } catch {}
      }
    }
  });

  const done = new Promise<{ completed: boolean; elapsedSec: number }>((resolve) => {
    proc.on("close", (code) => {
      resolve({ completed: code === 0, elapsedSec: (Date.now() - startedAt) / 1000 });
    });
    proc.on("error", () => resolve({ completed: false, elapsedSec: (Date.now() - startedAt) / 1000 }));
  });

  return {
    proc,
    done,
    stop: () => {
      // まず 'q' で正常終了を促す (HLSのセグメントも綺麗に閉じる)
      try {
        proc.stdin?.write("q");
        proc.stdin?.end();
      } catch {}
      // 3秒待って終わらなければ強制終了 (shimの子孫も含めて)
      setTimeout(() => {
        if (proc.exitCode !== null) return;
        try {
          proc.kill("SIGKILL");
        } catch {}
        if (process.platform === "win32" && proc.pid) {
          execFile(
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              `(Get-CimInstance Win32_Process -Filter "ParentProcessId=${proc.pid}").ProcessId`,
            ],
            (_e, stdout) => {
              for (const s of String(stdout).split(/\s+/).filter(Boolean)) {
                execFile("taskkill", ["/F", "/PID", s], () => {});
              }
            },
          );
        }
      }, 3000);
    },
  };
}
