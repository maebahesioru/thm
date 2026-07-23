// ヒカブー (hikabooru.hikamer.f5.si) から動画をランダム取得

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const API = "https://hikabooru.hikamer.f5.si/api/posts";

export type BooruVideo = {
  id: number;
  title: string; // タグから生成
  videoUrl: string;
  thumbnailUrl?: string;
  tags: string[];
  durationSec: number; // 不明なのでデフォルト値
};

let totalCount = 0;

// 総動画数を取得 (キャッシュ)
async function getTotalCount(): Promise<number> {
  if (totalCount > 0) return totalCount;
  try {
    const res = await fetch(`${API}?limit=1`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    const j = (await res.json()) as { total?: number };
    totalCount = j.total ?? 0;
    console.log(`[hikabooru] total posts: ${totalCount}`);
    return totalCount;
  } catch {
    return 0;
  }
}

// ランダムに1件取得
export async function pickRandomBooru(excludeIds: Set<string>): Promise<BooruVideo | null> {
  try {
    const total = await getTotalCount();
    if (total <= 0) return null;

    // 最大100回リトライ（除外に当たらないように）
    for (let attempt = 0; attempt < 100; attempt++) {
      const offset = Math.floor(Math.random() * total);
      const res = await fetch(`${API}?limit=1&offset=${offset}`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(15000),
      });
      const j = (await res.json()) as { results?: Array<{
        id: number;
        type?: string;
        contentUrl?: string;
        thumbnailUrl?: string;
        tags?: Array<{ names?: string[] }>;
      }> };
      const post = j.results?.[0];
      if (!post || !post.contentUrl || post.type !== "video") continue;
      if (excludeIds.has(String(post.id))) continue;

      const tags = post.tags?.flatMap((t) => t.names ?? []) ?? [];
      const title = tags.length > 0 ? tags.slice(0, 3).join(" / ") : `booru #${post.id}`;

      return {
        id: post.id,
        title: `[ヒカブー] ${title}`,
        videoUrl: `https://hikabooru.hikamer.f5.si/${post.contentUrl}`,
        thumbnailUrl: post.thumbnailUrl ? `https://hikabooru.hikamer.f5.si/${post.thumbnailUrl}` : undefined,
        tags,
        durationSec: 120, // 動画の長さ不明。yt-dlpで後からprobeする
      };
    }
    return null;
  } catch (e) {
    console.error("[hikabooru] fetch failed:", (e as Error).message);
    return null;
  }
}
