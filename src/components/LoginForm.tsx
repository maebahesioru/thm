"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/admin");
      router.refresh();
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "ログインに失敗しました");
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <label className="block text-sm text-neutral-300">
        パスワード
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm focus:border-red-600 outline-none"
          autoFocus
        />
      </label>
      {error && <div className="text-red-400 text-sm">{error}</div>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 py-2 text-sm font-bold"
      >
        ログイン
      </button>
    </form>
  );
}
