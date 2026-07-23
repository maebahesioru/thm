import { prisma } from "./db";
import { pickRandomByTag, nicoUrl, type NicoVideo } from "./niconico";
import { config, bandFor, CM_TAG, type Band } from "./config";

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 直近 replayNgDays 日に放送した動画 + これから放送予定の動画のID集合
async function buildExcludeIds(days: number, sourceTypes: string[]): Promise<Set<string>> {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const [history, future] = await Promise.all([
    prisma.playHistory.findMany({
      where: { playedAt: { gte: since }, sourceType: { in: sourceTypes } },
      select: { sourceId: true },
    }),
    prisma.program.findMany({
      where: { endAt: { gte: new Date() }, sourceType: { in: sourceTypes }, status: { notIn: ["skipped"] } },
      select: { sourceId: true },
    }),
  ]);
  return new Set([...history.map((h) => h.sourceId), ...future.map((f) => f.sourceId)]);
}

async function pickForBand(band: Band): Promise<{ video: NicoVideo; tag: string } | null> {
  const exclude = await buildExcludeIds(config.replayNgDays, ["niconico"]);
  const tags = shuffled(band.tags);
  for (const tag of tags) {
    const video = await pickRandomByTag(tag, exclude);
    if (video) return { video, tag };
    console.log(`[scheduler] tag "${tag}" -> no candidate, trying next tag`);
  }
  return null;
}

async function pickCm(): Promise<NicoVideo | null> {
  // CMは再放送禁止期間を1日に緩和 & 短尺動画も許可
  const exclude = await buildExcludeIds(1, ["niconico-cm"]);
  const video = await pickRandomByTag(CM_TAG, exclude, { minLen: 5 });
  return video;
}

function toProgramData(v: NicoVideo, opts: { startAt: Date; band: string; kind: string; tag: string }) {
  const durationSec = Math.max(1, Math.floor(v.lengthSeconds || 60));
  return {
    title: v.title,
    sourceType: "niconico",
    sourceId: v.contentId,
    originUrl: nicoUrl(v.contentId),
    author: v.userId ? `user/${v.userId}` : null,
    thumbnailUrl: v.thumbnailUrl ?? null,
    durationSec,
    startAt: opts.startAt,
    endAt: new Date(opts.startAt.getTime() + durationSec * 1000),
    band: opts.band,
    tags: JSON.stringify([opts.tag]),
    kind: opts.kind,
  };
}

// 番組表を horizon 時間先まで生成する
export async function ensureSchedule(horizonHours?: number): Promise<void> {
  const horizon = new Date(Date.now() + (horizonHours ?? config.scheduleHorizonHours) * 3600 * 1000);

  let cursor: Date;
  const last = await prisma.program.findFirst({ orderBy: { endAt: "desc" } });
  if (last && last.endAt > new Date()) {
    cursor = last.endAt;
  } else {
    cursor = new Date();
    // 開始時刻を秒単位で切り捨て
    cursor.setSeconds(0, 0);
  }

  while (cursor < horizon) {
    const band = bandFor(cursor);
    const picked = await pickForBand(band);
    if (!picked) {
      // 全タグで見つからない場合: プレースホルダ番組を10分挟む
      console.warn("[scheduler] no video found in any tag; inserting placeholder");
      const startAt = cursor;
      const endAt = new Date(startAt.getTime() + 10 * 60 * 1000);
      await prisma.program.create({
        data: {
          title: "【ただいま調整中】テレビヒカマニ",
          sourceType: "placeholder",
          sourceId: `placeholder-${startAt.toISOString()}`,
          durationSec: 600,
          startAt,
          endAt,
          band: band.id,
          kind: "program",
          tags: JSON.stringify([]),
        },
      });
      cursor = endAt;
      continue;
    }

    const program = await prisma.program.create({
      data: toProgramData(picked.video, { startAt: cursor, band: band.id, kind: "program", tag: picked.tag }),
    });
    cursor = program.endAt;

    // 番組間にCM挿入 (ヒカマニCMリンク)
    for (let i = 0; i < band.cmCount; i++) {
      const cm = await pickCm();
      if (!cm) break;
      const cmProgram = await prisma.program.create({
        data: toProgramData(cm, { startAt: cursor, band: band.id, kind: "cm", tag: CM_TAG }),
      });
      cursor = cmProgram.endAt;
    }
  }
}

// 現在放送中と次の番組
export async function getNowAndNext() {
  const now = new Date();
  const [nowAiring, next] = await Promise.all([
    prisma.program.findFirst({ where: { startAt: { lte: now }, endAt: { gt: now } }, orderBy: { startAt: "asc" } }),
    prisma.program.findFirst({ where: { startAt: { gt: now } }, orderBy: { startAt: "asc" } }),
  ]);
  return { nowAiring, next };
}

// 番組表 (直近1時間前〜24時間)
export async function getGuide(hours = 24) {
  const from = new Date(Date.now() - 3600 * 1000);
  const to = new Date(Date.now() + hours * 3600 * 1000);
  return prisma.program.findMany({
    where: { endAt: { gte: from }, startAt: { lte: to } },
    orderBy: { startAt: "asc" },
  });
}
