type Item = {
  id: string;
  channelTitle: string | null;
  title: string;
  youtubeVideoId: string;
  status: string;
  publishAt: string | null;
  createdAt: string;
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: "割込待ち", cls: "bg-yellow-700 text-yellow-100" },
  waiting_premiere: { label: "プレミア待機", cls: "bg-purple-800 text-purple-100" },
  airing: { label: "割込中", cls: "bg-red-700 text-white" },
  done: { label: "完了", cls: "bg-neutral-700 text-neutral-300" },
  skipped_live: { label: "ライブ除外", cls: "bg-neutral-800 text-neutral-400" },
};

export function InterruptionLog({ initial }: { initial: Item[] }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <ul className="divide-y divide-neutral-800 text-sm">
        {initial.length === 0 && <li className="py-2 text-neutral-500">割り込み履歴はありません</li>}
        {initial.map((i) => {
          const st = STATUS_LABEL[i.status] ?? { label: i.status, cls: "bg-neutral-700" };
          return (
            <li key={i.id} className="py-2 flex items-center gap-3 flex-wrap">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${st.cls}`}>{st.label}</span>
              <span className="text-neutral-400 text-xs shrink-0">{i.channelTitle}</span>
              <a
                href={`https://www.youtube.com/watch?v=${i.youtubeVideoId}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 min-w-48 truncate text-sky-300 hover:underline"
              >
                {i.title}
              </a>
              <span className="text-xs text-neutral-500">
                {new Date(i.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
