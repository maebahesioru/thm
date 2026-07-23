// スモークテスト: YouTube チャンネルID解決 / RSS / watchページ解析
import { resolveChannelId, fetchFeed, fetchWatchInfo } from "../src/lib/youtube";
import { WATCH_CHANNELS } from "../src/lib/config";

async function main() {
  for (const ch of WATCH_CHANNELS) {
    const id = await resolveChannelId(ch.handle);
    console.log(`${ch.handle} -> ${id ?? "解決失敗"}`);
    if (!id) continue;
    const feed = await fetchFeed(id);
    console.log(`  最新 ${feed.length}件: 先頭「${feed[0]?.title ?? "-"}」 (${feed[0]?.published.toISOString() ?? "-"})`);
    if (feed[0]) {
      const info = await fetchWatchInfo(feed[0].videoId);
      console.log(
        `  watchInfo: title=${info?.title?.slice(0, 40)} live=${info?.isLiveContent} now=${info?.isLiveNow} upcoming=${info?.isUpcoming} dur=${info?.durationSec}s`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
