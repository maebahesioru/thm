// ニコニコ動画 スナップショット検索API (認証不要)
// https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search

export type NicoVideo = {
  contentId: string; // sm123 など
  title: string;
  userId?: string;
  thumbnailUrl?: string;
  lengthSeconds: number;
  startTime?: string;
  tags?: string;
  viewCounter?: number;
};

const API = "https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search";
const UA = "thm-bot/0.1 (+https://coolify.hikamer.f5.si)";

const FIELDS = [
  "contentId",
  "title",
  "userId",
  "thumbnailUrl",
  "lengthSeconds",
  "startTime",
  "tags",
  "viewCounter",
].join(",");

async function search(
  tag: string,
  opts: { limit?: number; offset?: number; exact?: boolean; minLen?: number } = {},
): Promise<{ videos: NicoVideo[]; total: number }> {
  const { limit = 100, offset = 0, exact = true, minLen = 30 } = opts;
  const params = new URLSearchParams({
    q: tag,
    targets: exact ? "tagsExact" : "tags",
    fields: FIELDS,
    _sort: "-startTime",
    _limit: String(limit),
    _offset: String(offset),
    "filters[lengthSeconds][gte]": String(minLen),
  });
  const res = await fetch(`${API}?${params}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`niconico snapshot API ${res.status}`);
  const json = (await res.json()) as { data?: NicoVideo[]; meta?: { totalCount?: number } };
  return { videos: json.data ?? [], total: json.meta?.totalCount ?? 0 };
}

// タグから完全ランダムに1件拾う (除外IDを考慮)
export async function pickRandomByTag(
  tag: string,
  excludeIds: Set<string>,
  opts: { minLen?: number } = {},
): Promise<NicoVideo | null> {
  try {
    const head = await search(tag, { limit: 1, minLen: opts.minLen });
    if (head.total === 0) return null;
    // 全件からランダムな位置の1件を取得
    const offset = Math.floor(Math.random() * head.total);
    const { videos } = await search(tag, {
      limit: 1,
      offset,
      minLen: opts.minLen,
    });
    const candidates = videos.filter((v) => !excludeIds.has(v.contentId));
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  } catch (e) {
    console.error(`[niconico] search failed for tag "${tag}":`, e);
    return null;
  }
}

export function nicoUrl(contentId: string): string {
  return `https://www.nicovideo.jp/watch/${contentId}`;
}
