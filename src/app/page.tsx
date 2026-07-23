import { GuideApp } from "@/components/GuideApp";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div>
      <h1 className="text-2xl font-black mb-1">番組表</h1>
      <p className="text-sm text-neutral-400 mb-6">最大24時間先まで表示 / 時刻は日本時間 (JST)</p>
      <GuideApp />
    </div>
  );
}
