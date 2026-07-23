"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
      className="text-sm text-neutral-400 hover:text-white border border-neutral-700 rounded-lg px-3 py-1.5"
    >
      ログアウト
    </button>
  );
}
