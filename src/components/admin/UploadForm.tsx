"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ProgramOpt = { id: string; title: string; startAt: string; endAt: string };

export function UploadForm({ programs }: { programs: ProgramOpt[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [triggerType, setTriggerType] = useState<"after_current" | "after_program">("after_current");
  const [programId, setProgramId] = useState("");
  const [progress, setProgress] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setProgress("アップロード中…");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", title || file.name);
    fd.append("triggerType", triggerType);
    if (triggerType === "after_program" && programId) fd.append("programId", programId);
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    if (res.ok) {
      setProgress("キューに登録しました");
      setFile(null);
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } else {
      const json = await res.json().catch(() => ({}));
      setProgress(`失敗: ${json.error ?? res.status}`);
    }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });

  return (
    <form onSubmit={submit} className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/*,.mp4,.mkv,.mov,.webm"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-700 file:px-3 file:py-2 file:text-sm file:font-bold hover:file:bg-neutral-600"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="タイトル (空=ファイル名)"
          className="flex-1 min-w-48 rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-red-600"
        />
      </div>
      <div className="flex flex-wrap gap-3 items-center text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={triggerType === "after_current"} onChange={() => setTriggerType("after_current")} />
          現在の番組が終わったら放送
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={triggerType === "after_program"} onChange={() => setTriggerType("after_program")} />
          指定した番組が終わったら放送
        </label>
        {triggerType === "after_program" && (
          <select
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            className="rounded-lg bg-neutral-950 border border-neutral-700 px-2 py-2 text-sm max-w-full"
          >
            <option value="">番組を選択…</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {fmt(p.startAt)}〜 {p.title}
              </option>
            ))}
          </select>
        )}
        <button
          disabled={!file}
          className="ml-auto rounded-lg bg-red-600 hover:bg-red-500 px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          キューに追加
        </button>
      </div>
      {progress && <div className="text-xs text-neutral-400">{progress}</div>}
    </form>
  );
}
