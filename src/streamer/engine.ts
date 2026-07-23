import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { prisma } from "../lib/db";
import { config } from "../lib/config";
import { ensureSchedule } from "../lib/scheduler";
import { breakingNews, getActiveTickers } from "../lib/ticker";
import { play, type PlayHandle } from "./ffmpeg";
import { downloadVideo, downloadComments } from "./downloader";
import { writeTickerFile, writeCommentsAss, commentsAssPath, ensureOverlayDirs, writeTitleFile } from "./overlay";

const run = promisify(execFile);

type CurrentUnit = {
  kind: "program" | "queue" | "interrupt" | "bumper";
  handle: PlayHandle;
  startedAt: number;
  baseOffset: number;
  durationSec: number;
  programId?: string;
  queueId?: string;
  interruptionId?: string;
  expectStop?: boolean;
  title: string;
};

const BUMPER_SEC = 6;

async function probeDuration(file: string): Promise<number> {
  try {
    const { stdout } = await run("ffprobe", [
      "-v",
      "quiet",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      file,
    ]);
    const d = parseFloat(stdout.trim());
    return isFinite(d) && d > 0 ? d : 300;
  } catch {
    return 300;
  }
}

export class Engine {
  private current: CurrentUnit | null = null;
  private lastTickerText = "";
  private lastScheduleTopUp = 0;
  private lastFinishedProgramId: string | null = null;
  // 起動直後=false (壁時計に同期)。最初のユニット完了後=true (連続再生モード)
  private sequential = false;
  private toppingUp = false;
  // 番組/キューの再生中フラグ
  private busy = false;
  // 割り込み毎にインクリメント
  private generation = 0;
  // 次番組の先読み結果 { programId, file, commentsAss }
  private prefetch: { programId: string; file: string | null; ass: string | null } | null = null;
  // 速報テロップ発生時に次の再生ユニットに速報音をミックスする
  private needAlertSound = false;
  private lastHadBreaking = false;
  private readonly alertPath = path.join(process.cwd(), "data", "sokuhou.mp3");
  // 放送休止フィラー
  private readonly fillerPath = path.join(process.cwd(), "data", "uploads", "1784710268689_test-news.mp4");
  // 次番組予告用
  private nextProgramTitle: string | null = null;
  // ffmpeg統計 (管理画面用)
  private ffmpegStats: { bitrate?: string; fps?: string; speed?: string } = {};

  async run() {
    ensureOverlayDirs();
    writeTickerFile("");
    console.log(`[engine] mode=${config.streamMode} で起動`);

    // 前回プロセス kill 等で残った中途状態をリセット
    // airing→interruptedで再開位置を保持。offsetが0ならscheduledに戻す
    const airingPrograms = await prisma.program.findMany({ where: { status: "airing" } });
    for (const p of airingPrograms) {
      await prisma.program.update({
        where: { id: p.id },
        data: p.resumeOffsetSec > 0 ? { status: "interrupted" } : { status: "scheduled" },
      });
    }
    // 残留した古いオフセットをクリア (scheduledなのにoffset>0は前回から継続再生してない証拠)
    await prisma.program.updateMany({
      where: { status: "scheduled", resumeOffsetSec: { gt: 0 } },
      data: { resumeOffsetSec: 0 },
    });
    await prisma.queueItem.updateMany({ where: { status: "airing" }, data: { status: "queued" } });
    await prisma.interruption.updateMany({ where: { status: "airing" }, data: { status: "pending" } });

    // 初回は直近3時間分だけ素早く生成し、残りはバックグラウンドで補完
    await this.topUpSchedule(true, 3);
    void this.topUpSchedule(true);

    // テロップファイル定期更新
    setInterval(() => void this.refreshTicker(), 2000);
    // スケジューラ定期補充 (10分毎)
    setInterval(() => void this.topUpSchedule(false), 10 * 60 * 1000);

    // メインループ
    for (;;) {
      try {
        await this.tick();
      } catch (e) {
        console.error("[engine] tick error:", e);
      }
      await sleep(1000);
    }
  }

  private async tick() {
    // 0. 管理画面からのコマンド処理
    const cmd = await prisma.setting.findUnique({ where: { key: "engineCommand" } });
    if (cmd?.value === "skip") {
      await prisma.setting.delete({ where: { key: "engineCommand" } }).catch(() => {});
      await this.doSkip();
      return;
    }

    // 1. 割り込み要求があれば最優先 (再生中ユニットはinterrupt内で停止される)
    const pending = await prisma.interruption.findFirst({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
    });
    if (pending) {
      await this.interrupt(pending.id);
      return;
    }

    // 再生中は完了コールバックに任せる
    if (this.busy) return;

    // 2. アップロード済みmp4キュー
    const queueItem = await this.nextQueueItem();
    if (queueItem) {
      void this.playQueue(queueItem);
      return;
    }

    // 3. 番組
    void this.playNextProgram();
  }

  // ---- 割り込み ----
  private async interrupt(interruptionId: string) {
    this.generation++;
    this.prefetch = null;
    this.needAlertSound = true; // 割り込み時は必ず速報音を鳴らす
    this.lastHadBreaking = true; // refreshTickerの二重発火防止
    const interruption = await prisma.interruption.findUnique({ where: { id: interruptionId } });
    if (!interruption || interruption.status !== "pending") return;
    await prisma.interruption.update({ where: { id: interruptionId }, data: { status: "airing" } });
    await breakingNews(interruption.channelTitle ?? "YouTube", interruption.title, 15);

    // 現在の番組を中断
    if (this.current && (this.current.kind === "program" || this.current.kind === "queue")) {
      const cur = this.current;
      const elapsed = cur.baseOffset + (Date.now() - cur.startedAt) / 1000;
      cur.expectStop = true;
      cur.handle.stop();
      if (cur.programId) {
        await prisma.program.update({
          where: { id: cur.programId },
          data: { status: "interrupted", resumeOffsetSec: Math.floor(elapsed) },
        });
        console.log(`[engine] 番組中断: ${cur.title} @ ${Math.floor(elapsed)}s`);
      } else if (cur.queueId) {
        await prisma.queueItem.update({ where: { id: cur.queueId }, data: { status: "queued" } });
      }
      await cur.handle.done;
      this.current = null;
    }

    // 速報バンパー
    console.log(`[engine] 緊急速報: ${interruption.channelTitle}「${interruption.title}」`);
    writeTitleFile(`【緊急速報】${interruption.channelTitle}で新着動画が公開されました`);
    await this.playBumper(`【緊急速報】${interruption.channelTitle}で新着動画が公開されました`);

    // 割り込み動画
    const startedAt = Date.now();
    writeTitleFile(`【緊急速報】 ${interruption.title}`);
    const file = await downloadVideo("youtube", interruption.youtubeVideoId);
    if (file) {
      const duration = await probeDuration(file);
      await this.playUnit({
        kind: "interrupt",
        title: interruption.title,
        inputFile: file,
        durationSec: duration,
        interruptionId: interruption.id,
      });
    } else {
      console.error(`[engine] 割り込み動画の取得に失敗: ${interruption.youtubeVideoId}`);
      writeTitleFile("【お詫び】新着動画を取得できませんでした");
      await this.playBumper(`【お詫び】新着動画を取得できませんでした`, 4);
    }
    await prisma.interruption.update({ where: { id: interruptionId }, data: { status: "done" } });

    // 遅れた分だけ今後の番組表をシフト
    const delayMs = Date.now() - startedAt + BUMPER_SEC * 1000;
    await this.shiftFutureSchedule(delayMs);
  }

  private async playBumper(text: string, sec = BUMPER_SEC) {
    await this.playUnit({ kind: "bumper", title: text, placeholderTitle: text, placeholderColor: "0x8B0000", durationSec: sec });
  }

  private async shiftFutureSchedule(deltaMs: number) {
    if (deltaMs < 10000) return;
    const future = await prisma.program.findMany({
      where: { status: { in: ["scheduled", "interrupted"] } },
      select: { id: true, startAt: true, endAt: true, status: true },
    });
    for (const p of future) {
      await prisma.program.update({
        where: { id: p.id },
        data: {
          // interrupted番組はstartAtを動かさずendAtのみ延長 (再開位置はresumeOffsetSecが持つ)
          startAt: p.status === "scheduled" ? new Date(p.startAt.getTime() + deltaMs) : p.startAt,
          endAt: new Date(p.endAt.getTime() + deltaMs),
        },
      });
    }
    console.log(`[engine] 番組表を ${Math.round(deltaMs / 1000)}s シフト (${future.length}件)`);
  }

  // ---- キュー ----
  private async nextQueueItem() {
    // 「番組が終わったら」: エンジン起動直後で放送中スロットがある場合は、その終了まで待つ
    if (this.lastFinishedProgramId === null) {
      const now = new Date();
      const currentSlot = await prisma.program.findFirst({
        where: { status: { in: ["scheduled", "airing"] }, startAt: { lte: now }, endAt: { gt: now } },
      });
      if (currentSlot) return null;
    }
    const items = await prisma.queueItem.findMany({
      where: { status: "queued" },
      orderBy: { createdAt: "asc" },
    });
    for (const item of items) {
      if (item.triggerType === "after_current") return item;
      if (item.triggerType === "after_program" && item.programId) {
        const p = await prisma.program.findUnique({ where: { id: item.programId } });
        if (!p || p.status === "done" || p.endAt < new Date()) return item;
      }
    }
    return null;
  }

  private async playQueue(item: { id: string; title: string; filePath: string }) {
    this.busy = true;
    try {
      await this.playQueueInner(item);
    } finally {
      this.busy = false;
    }
  }

  private async playQueueInner(item: { id: string; title: string; filePath: string }) {
    if (!fs.existsSync(item.filePath)) {
      console.error(`[engine] キューのファイルが存在しません: ${item.filePath}`);
      await prisma.queueItem.update({ where: { id: item.id }, data: { status: "canceled" } });
      return;
    }
    console.log(`[engine] キュー再生: ${item.title}`);
    await prisma.queueItem.update({ where: { id: item.id }, data: { status: "airing" } });
    const startedAt = Date.now();
    const duration = await probeDuration(item.filePath);

    // 番組表に表示するためのProgram行を作成
    const guideProgram = await prisma.program.create({
      data: {
        title: item.title,
        sourceType: "queue",
        sourceId: item.id,
        durationSec: Math.ceil(duration),
        startAt: new Date(startedAt),
        endAt: new Date(startedAt + Math.ceil(duration) * 1000),
        kind: "queue",
        status: "airing",
      },
    });

    const { completed } = await this.playUnit({
      kind: "queue",
      title: item.title,
      inputFile: item.filePath,
      durationSec: duration,
      queueId: item.id,
    });
    if (completed) {
      await prisma.queueItem.update({ where: { id: item.id }, data: { status: "done" } });
      await prisma.program.update({ where: { id: guideProgram.id }, data: { status: "done" } });
      await this.shiftFutureSchedule(Date.now() - startedAt);
      this.lastFinishedProgramId = `queue:${item.id}`;
    } else {
      // 中断された場合はキュー先頭に戻す
      await prisma.queueItem.update({ where: { id: item.id }, data: { status: "queued" } });
    }
  }

  // ---- 番組 ----
  private async playNextProgram() {
    this.busy = true;
    try {
      await this.playNextProgramInner();
    } finally {
      this.busy = false;
    }
  }

  private async playNextProgramInner() {
    const now = new Date();
    const gen = this.generation;

    // 起動直後のみ: 古い未放送番組をスキップ (停止後の巻き戻し再生防止)
    if (!this.sequential) {
      await prisma.program.updateMany({
        where: { status: "scheduled", endAt: { lt: new Date(now.getTime() - 5 * 60 * 1000) } },
        data: { status: "skipped" },
      });
    }

    // 中断された番組の再開が最優先
    const interrupted = await prisma.program.findFirst({
      where: { status: "interrupted" },
      orderBy: { startAt: "asc" },
    });
    const program =
      interrupted ??
      (await prisma.program.findFirst({
        where: this.sequential
          ? { status: "scheduled" }
          : // 起動直後: 現在スロット or 15分以内に始まる番組を拾う (空き時間の無音を防ぐ)
            { status: "scheduled", startAt: { lte: new Date(now.getTime() + 15 * 60 * 1000) }, endAt: { gt: now } },
        orderBy: { startAt: "asc" },
      }));

    if (!program) {
      // 隙間 or 番組表切れ → 放送休止フィラーを流す
      await this.topUpSchedule(false);
      await this.playFiller();
      return;
    }

    // 起動直後は放送時刻に合わせて途中から、連続運用中は常に頭から再生
    const offset = interrupted
      ? program.resumeOffsetSec
      : this.sequential
        ? program.resumeOffsetSec
        : Math.max(0, (now.getTime() - program.startAt.getTime()) / 1000);
    if (offset >= program.durationSec) {
      await prisma.program.update({ where: { id: program.id }, data: { status: "done" } });
      return;
    }

    await prisma.program.update({ where: { id: program.id }, data: { status: "airing" } });
    console.log(`[engine] 番組開始: ${program.title} (${program.kind}, offset=${Math.floor(offset)}s)`);

    // 動画上のタイトルバーを更新
    writeTitleFile(program.title !== "【ただいま調整中】テレビヒカマニ" ? program.title : "テレビヒカマニ");

    // 次番組をDBから取得 (予告テロップ用)
    if (!interrupted) {
      const nxt = await prisma.program.findFirst({
        where: { status: "scheduled", startAt: { gt: program.startAt } },
        orderBy: { startAt: "asc" },
        select: { title: true },
      });
      this.nextProgramTitle = nxt?.title ?? null;
    }

    // 次の番組を先読み開始 (現在の番組再生中にバックグラウンドDL)
    if (!interrupted) this.prefetchNext(program.id, gen);

    // コメントASS生成 (ニコニコのみ・失敗しても続行)
    let ass: string | null = null;
    const prefetchHit = this.prefetch?.programId === program.id;
    if (prefetchHit && this.prefetch) {
      // 先読み済みのデータを使う (ダウンロード待ちが不要)
      ass = this.prefetch.ass;
    } else if (program.sourceType === "niconico") {
      const comments = await downloadComments(program.sourceId, program.durationSec);
      if (comments.length > 0) {
        const p = commentsAssPath(program.id);
        if (writeCommentsAss(comments, program.durationSec, p)) ass = p;
        console.log(`[engine] コメント ${comments.length}件をオーバーレイ`);
      }
    }

    let file: string | null;
    if (prefetchHit && this.prefetch) {
      file = this.prefetch.file;
    } else {
      file = await downloadVideo(program.sourceType, program.sourceId);
    }

    // ダウンロード失敗時は1回リトライ、それでもダメならスキップ
    if (!file && program.sourceType === "niconico") {
      console.log(`[engine] DL失敗リトライ: ${program.sourceId}`);
      await sleep(5000);
      file = await downloadVideo(program.sourceType, program.sourceId);
    }
    if (!file && program.sourceType === "niconico") {
      console.log(`[engine] DL失敗スキップ: ${program.title}`);
      await prisma.program.update({ where: { id: program.id }, data: { status: "skipped" } });
      await this.shiftFutureSchedule(-program.durationSec * 1000);
      return;
    }
    const unit: Parameters<Engine["playUnit"]>[0] = file
      ? {
          kind: "program",
          title: program.title,
          inputFile: file,
          offsetSec: offset,
          durationSec: program.durationSec,
          programId: program.id,
          commentsAss: ass,
        }
      : {
          kind: "program",
          title: program.title,
          placeholderTitle: program.title,
          placeholderColor: program.kind === "cm" ? "0x333333" : "0x003366",
          offsetSec: offset,
          durationSec: Math.min(program.durationSec, 1800),
          programId: program.id,
        };

    // ダウンロード等の準備中に割り込みが発生していたら再生しない
    if (gen !== this.generation) {
      console.log(`[engine] 割り込み検知のため再生中止: ${program.title}`);
      this.prefetch = null;
      await prisma.program.update({
        where: { id: program.id },
        data: { status: interrupted ? "interrupted" : "scheduled" },
      });
      return;
    }

    // 先読みデータを消費したらクリア
    if (prefetchHit) this.prefetch = null;

    const { completed } = await this.playUnit(unit);

    if (completed) {
      await prisma.program.update({ where: { id: program.id }, data: { status: "done" } });
      await prisma.playHistory.create({
        data: {
          sourceType: program.kind === "cm" ? "niconico-cm" : program.sourceType,
          sourceId: program.sourceId,
          title: program.title,
        },
      });
      this.lastFinishedProgramId = program.id;
      console.log(`[engine] 番組終了: ${program.title}`);
    } else {
      // 中断(expectStop)の場合 → 何もしない (割り込み処理が状態を変えている)
      // ffmpegクラッシュの場合 → 自動リトライ (最大10回、RTMPなら無限)
      const cur = await prisma.program.findUnique({ where: { id: program.id } });
      if (cur?.status !== "airing") return;
      const maxRetries = config.streamMode === "rtmp" ? 999 : 3;
      for (let retry = 1; retry <= maxRetries; retry++) {
        const delay = retry === 1 ? 2000 : 5000;
        console.error(`[engine] ffmpeg異常終了: ${program.title} (${retry}回目リトライ)`);
        await sleep(delay);
        const fresh = await prisma.program.findUnique({ where: { id: program.id } });
        const retryOffset = fresh?.resumeOffsetSec ?? offset;
        const retryUnit: Parameters<Engine["playUnit"]>[0] = file
          ? { kind: "program", title: program.title, inputFile: file, offsetSec: retryOffset, durationSec: program.durationSec, programId: program.id, commentsAss: ass }
          : { kind: "program", title: program.title, placeholderTitle: program.title, placeholderColor: program.kind === "cm" ? "0x333333" : "0x003366", offsetSec: retryOffset, durationSec: Math.min(program.durationSec, 1800), programId: program.id };
        const { completed: retryOk } = await this.playUnit(retryUnit);
        if (retryOk) {
          await prisma.program.update({ where: { id: program.id }, data: { status: "done" } });
          await prisma.playHistory.create({
            data: { sourceType: program.kind === "cm" ? "niconico-cm" : program.sourceType, sourceId: program.sourceId, title: program.title },
          });
          this.lastFinishedProgramId = program.id;
          console.log(`[engine] 番組終了(復旧): ${program.title}`);
          return;
        }
      }
      console.error(`[engine] リトライ上限: ${program.title} → スキップ`);
      await prisma.program.update({ where: { id: program.id }, data: { status: "done" } });
    }
  }

  // ---- スキップ ----
  private async doSkip() {
    console.log("[engine] スキップコマンド受信");
    if (this.current && (this.current.kind === "program" || this.current.kind === "queue")) {
      const cur = this.current;
      cur.expectStop = true;
      cur.handle.stop();
      if (cur.programId) {
        await prisma.program.update({ where: { id: cur.programId }, data: { status: "done" } });
      } else if (cur.queueId) {
        await prisma.queueItem.update({ where: { id: cur.queueId }, data: { status: "done" } });
      }
      console.log(`[engine] スキップ: ${cur.title}`);
      await cur.handle.done;
      this.current = null;
      this.busy = false;
    }
  }

  // ---- 先読み ----
  private prefetchNext(currentProgramId: string, gen: number) {
    // 次のscheduled番組をDBから取得してバックグラウンドDL開始
    void (async () => {
      const next = await prisma.program.findFirst({
        where: { status: "scheduled", startAt: { gt: new Date(0) } },
        orderBy: { startAt: "asc" },
        select: { id: true, sourceType: true, sourceId: true, durationSec: true },
      });
      if (!next || next.id === currentProgramId) return;

      const [file, ass] = await Promise.all([
        downloadVideo(next.sourceType, next.sourceId),
        (async () => {
          if (next.sourceType !== "niconico") return null;
          const comments = await downloadComments(next.sourceId, next.durationSec);
          if (comments.length === 0) return null;
          const p = commentsAssPath(next.id);
          return writeCommentsAss(comments, next.durationSec, p) ? p : null;
        })(),
      ]);

      // 生成番号が変わっていなければ登録
      if (gen === this.generation) {
        this.prefetch = { programId: next.id, file, ass };
        if (file) console.log(`[engine] 先読み完了: ${next.sourceId}`);
      }
    })();
  }

  // ---- 放送休止フィラー ----
  private async playFiller() {
    if (!fs.existsSync(this.fillerPath)) {
      await sleep(3000);
      return;
    }
    const duration = await probeDuration(this.fillerPath);
    if (duration <= 0) { await sleep(3000); return; }
    this.busy = true;
    writeTitleFile("テレビヒカマニ 放送休止中");
    try {
      console.log("[engine] 放送休止フィラー再生");
      await this.playUnit({
        kind: "program",
        title: "放送休止中",
        inputFile: this.fillerPath,
        durationSec: Math.min(duration, 60),
        noTicker: true,
      } as Parameters<Engine["playUnit"]>[0]);
    } finally {
      this.busy = false;
    }
  }

  // ---- ユニット再生 ----
  private async playUnit(u: {
    kind: CurrentUnit["kind"];
    title: string;
    inputFile?: string;
    placeholderTitle?: string;
    placeholderColor?: string;
    offsetSec?: number;
    durationSec: number;
    programId?: string;
    queueId?: string;
    interruptionId?: string;
    commentsAss?: string | null;
    noTicker?: boolean;
  }): Promise<{ completed: boolean }> {
    const alertSound =
      this.needAlertSound && fs.existsSync(this.alertPath) ? this.alertPath : undefined;
    if (alertSound) {
      this.needAlertSound = false;
      console.log("[engine] 速報音をミックス");
    }
    const handle = play({
      inputFile: u.inputFile,
      placeholderTitle: u.placeholderTitle,
      placeholderColor: u.placeholderColor,
      offsetSec: u.offsetSec ?? 0,
      durationSec: u.durationSec,
      commentsAss: u.commentsAss,
      alertSound,
      noTicker: u.noTicker,
    });
    const unit: CurrentUnit = {
      kind: u.kind,
      handle,
      startedAt: Date.now(),
      baseOffset: u.offsetSec ?? 0,
      durationSec: u.durationSec,
      programId: u.programId,
      queueId: u.queueId,
      interruptionId: u.interruptionId,
      title: u.title,
    };
    this.current = unit;
    await this.saveState();

    // 再生中は3秒ごとにresumeOffsetをDBに保存 (クラッシュ再開用)
    let offsetTimer: ReturnType<typeof setInterval> | null = null;
    if (unit.kind === "program" && unit.programId) {
      offsetTimer = setInterval(async () => {
        if (!this.current || this.current.programId !== unit.programId) return;
        const elapsed = Math.floor(unit.baseOffset + (Date.now() - unit.startedAt) / 1000);
        await prisma.program.update({
          where: { id: unit.programId },
          data: { resumeOffsetSec: elapsed },
        }).catch(() => {});
      }, 3000);
    }

    const res = await handle.done;
    if (offsetTimer) clearInterval(offsetTimer);
    if (this.current === unit) this.current = null;
    if (res.completed) this.sequential = true;
    await this.saveState();
    return { completed: res.completed && !unit.expectStop };
  }

  // ---- テロップ ----
  private async refreshTicker() {
    try {
      const tickers = await getActiveTickers();
      const breaking = tickers.find((t) => t.kind === "breaking");
      let text = breaking
        ? breaking.text
        : tickers
            .slice(0, 3)
            .map((t) => t.text)
            .join("　◇　");

      // 次番組予告 (残り30秒以内なら先頭に追加)
      if (!breaking && this.current && this.current.kind === "program" && this.nextProgramTitle) {
        const elapsed = this.current.baseOffset + (Date.now() - this.current.startedAt) / 1000;
        const remaining = this.current.durationSec - elapsed;
        if (remaining > 0 && remaining <= 30) {
          text = `まもなく: ${this.nextProgramTitle}　◇　${text}`;
        }
      }

      if (text !== this.lastTickerText) {
        this.lastTickerText = text;
        writeTickerFile(text);
      }
      // 速報出現で通知音フラグ
      if (!!breaking && !this.lastHadBreaking) {
        this.needAlertSound = true;
      }
      this.lastHadBreaking = !!breaking;
    } catch {}
  }

  private async topUpSchedule(force: boolean, horizonHours?: number) {
    if (this.toppingUp) return;
    if (!force && Date.now() - this.lastScheduleTopUp < 5 * 60 * 1000) return;
    this.toppingUp = true;
    this.lastScheduleTopUp = Date.now();
    try {
      await ensureSchedule(horizonHours);
    } catch (e) {
      console.error("[engine] ensureSchedule error:", (e as Error).message);
    } finally {
      this.toppingUp = false;
    }
  }

  private async saveState() {
    const state = this.current
      ? {
          state: "playing",
          kind: this.current.kind,
          title: this.current.title,
          startedAt: new Date(this.current.startedAt).toISOString(),
          offsetSec: Math.floor(this.current.baseOffset + (Date.now() - this.current.startedAt) / 1000),
          durationSec: this.current.durationSec,
        }
      : { state: "idle" };
    await prisma.setting
      .upsert({ where: { key: "engineState" }, update: { value: JSON.stringify(state) }, create: { key: "engineState", value: JSON.stringify(state) } })
      .catch(() => {});
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
