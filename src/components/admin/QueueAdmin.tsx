"use client";

import { useRouter } from "next/navigation";

type Item = {
  id: string;
  title: string;
  triggerType: string;
  status: string;
  note: string | null;
  createdAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  queued: "待機中",
  airing: "放送中",
  done: "完了",
  canceled: "キャンセル",
};

export function QueueAdmin({ initial }: { initial: Item[] }) {
  const router = useRouter();
  const cancel = async (id: string) => {
    await fetch(`/api/admin/queue?id=${id}`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <ul className="divide-y divide-neutral-800 text-sm">
        {initial.length === 0 && <li className="py-2 text-neutral-500">キューは空です</li>}
        {initial.map((i) => (
          <li key={i.id} className="py-2 flex items-center gap-3">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                i.status === "queued"
                  ? "bg-sky-800 text-sky-100"
                  : i.status === "airing"
                    ? "bg-red-700 text-white"
                    : "bg-neutral-700 text-neutral-300"
              }`}
            >
              {STATUS_LABEL[i.status] ?? i.status}
            </span>
            <span className="flex-1 truncate">{i.title}</span>
            <span className="text-xs text-neutral-500">
              {i.triggerType === "after_current" ? "現在の番組の後" : "指定番組の後"}
            </span>
            <span className="text-xs text-neutral-500">
              {new Date(i.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
            </span>
            {i.status === "queued" && (
              <button onClick={() => cancel(i.id)} className="text-xs text-neutral-400 hover:text-red-400">
                キャンセル
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
