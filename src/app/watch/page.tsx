import { WatchPlayer } from "@/components/WatchPlayer";

export const dynamic = "force-dynamic";

export default function WatchPage() {
  return (
    <div>
      <h1 className="text-2xl font-black mb-1">視聴</h1>
      <p className="text-sm text-neutral-400 mb-6">24時間生配信中</p>
      <WatchPlayer />
    </div>
  );
}
