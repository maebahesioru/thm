import { config } from "@/lib/config";
import { WatchPlayer } from "@/components/WatchPlayer";
import { YouTubeEmbed } from "@/components/YouTubeEmbed";

export const dynamic = "force-dynamic";

export default function WatchPage() {
  const isRtmp = config.streamMode === "rtmp" && !!config.youtubeStreamKey;

  return (
    <div>
      <h1 className="text-2xl font-black mb-1">視聴</h1>
      <p className="text-sm text-neutral-400 mb-6">
        {isRtmp ? "YouTube 本配信中" : "開発プレビュー (HLS)"}
      </p>
      {isRtmp ? <YouTubeEmbed channelId={config.youtubeChannelId} videoId={config.youtubeLiveVideoId || undefined} /> : <WatchPlayer />}
    </div>
  );
}
