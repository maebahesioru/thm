import { prisma } from "../lib/db";
import { config, WATCH_CHANNELS } from "../lib/config";
import { resolveChannelId, fetchFeed, fetchWatchInfo } from "../lib/youtube";

// HIKAKIN/SEIKIN各チャンネルの新着監視。
// - ライブ配信は除外
// - プレミア公開はカウントダウン終了(publishAt)まで待機
// - 初回起動時は既存エントリを既読にして暴発防止

const channelIdCache = new Map<string, string>();
let bootstrapped = false;

async function getChannelId(handle: string): Promise<string | null> {
  if (channelIdCache.has(handle)) return channelIdCache.get(handle)!;
  const key = `yt_channel_${handle}`;
  const saved = await prisma.setting.findUnique({ where: { key } });
  if (saved) {
    channelIdCache.set(handle, saved.value);
    return saved.value;
  }
  const id = await resolveChannelId(handle);
  if (id) {
    await prisma.setting.upsert({ where: { key }, update: { value: id }, create: { key, value: id } });
    channelIdCache.set(handle, id);
  }
  return id;
}

async function bootstrap() {
  for (const ch of WATCH_CHANNELS) {
    const id = await getChannelId(ch.handle);
    if (!id) continue;
    try {
      const entries = await fetchFeed(id);
      for (const e of entries) {
        await prisma.seenVideo.upsert({ where: { id: e.videoId }, update: {}, create: { id: e.videoId } });
      }
      console.log(`[monitor] bootstrap: ${ch.label} (${id}) ${entries.length}件を既読化`);
    } catch (e) {
      console.error(`[monitor] bootstrap failed for ${ch.label}:`, (e as Error).message);
    }
  }
  bootstrapped = true;
}

async function pollOnce() {
  for (const ch of WATCH_CHANNELS) {
    const channelId = await getChannelId(ch.handle);
    if (!channelId) {
      console.warn(`[monitor] channelId解決失敗: ${ch.handle}`);
      continue;
    }
    let entries;
    try {
      entries = await fetchFeed(channelId);
    } catch (e) {
      console.error(`[monitor] feed取得失敗 ${ch.label}:`, (e as Error).message);
      continue;
    }
    for (const e of entries) {
      const seen = await prisma.seenVideo.findUnique({ where: { id: e.videoId } });
      if (seen) continue;

      const already = await prisma.interruption.findUnique({ where: { youtubeVideoId: e.videoId } });
      if (already) {
        await prisma.seenVideo.create({ data: { id: e.videoId } });
        continue;
      }

      // 新着検出 -> ライブ/プレミア判定
      const info = await fetchWatchInfo(e.videoId);
      if (!info) {
        // 判定不能 → 初回は保留、2回目で諦めて既読化
        const seen = await prisma.seenVideo.findUnique({ where: { id: e.videoId + "_retry" } });
        if (seen) {
          await prisma.seenVideo.create({ data: { id: e.videoId } }).catch(() => {});
          await prisma.seenVideo.delete({ where: { id: e.videoId + "_retry" } }).catch(() => {});
          console.log(`[monitor] 判定諦め: ${e.title}`);
        } else {
          await prisma.seenVideo.create({ data: { id: e.videoId + "_retry" } }).catch(() => {});
          console.log(`[monitor] 判定保留: ${e.title} (${e.videoId})`);
        }
        continue;
      }
      await prisma.seenVideo.create({ data: { id: e.videoId } });

      if (info.isLiveNow && !info.isUpcoming) {
        console.log(`[monitor] ライブのため除外: ${e.title} (${e.videoId})`);
        await prisma.interruption.create({
          data: {
            channelId,
            channelTitle: ch.label,
            youtubeVideoId: e.videoId,
            title: e.title,
            status: "skipped_live",
          },
        });
        continue;
      }
      if (info.isUpcoming && info.premiereStartAt) {
        console.log(`[monitor] プレミア公開待機: ${e.title} -> ${info.premiereStartAt.toISOString()}`);
        await prisma.interruption.create({
          data: {
            channelId,
            channelTitle: ch.label,
            youtubeVideoId: e.videoId,
            title: e.title,
            publishAt: info.premiereStartAt,
            status: "waiting_premiere",
          },
        });
        continue;
      }
      console.log(`[monitor] 新着検出: ${ch.label}「${e.title}」(${e.videoId})`);
      await prisma.interruption.create({
        data: {
          channelId,
          channelTitle: ch.label,
          youtubeVideoId: e.videoId,
          title: e.title,
          publishAt: e.published,
          status: "pending",
        },
      });
    }
  }
}

// waiting_premiere の公開時刻到達チェック
async function promotePremieres() {
  const waiting = await prisma.interruption.findMany({
    where: { status: "waiting_premiere", publishAt: { lte: new Date() } },
  });
  for (const w of waiting) {
    const info = await fetchWatchInfo(w.youtubeVideoId);
    if (!info) continue; // 判定不能 -> 待機継続
    if (info.isUpcoming && info.premiereStartAt && info.premiereStartAt > new Date()) {
      // 公開時刻が後ろにずれた
      await prisma.interruption.update({
        where: { id: w.id },
        data: { publishAt: info.premiereStartAt },
      });
      continue;
    }
    console.log(`[monitor] プレミア公開開始: ${w.title}`);
    await prisma.interruption.update({ where: { id: w.id }, data: { status: "pending" } });
  }
}

export async function startMonitor() {
  console.log("[monitor] YouTube新着監視を開始");
  if (!bootstrapped) await bootstrap();
  await pollOnce();
  setInterval(async () => {
    try {
      await promotePremieres();
      await pollOnce();
    } catch (e) {
      console.error("[monitor] poll error:", (e as Error).message);
    }
  }, config.youtubePollIntervalSec * 1000);
}
