"use client";

export function YouTubeEmbed({ channelId, videoId }: { channelId: string; videoId?: string }) {
  const src = videoId
    ? `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0`
    : channelId
      ? `https://www.youtube.com/embed/live_stream?channel=${channelId}&autoplay=1&mute=0`
      : `https://www.youtube.com/embed/live_stream?channel=UCZf__ehlCEBPop-_sldpBUQ&autoplay=1&mute=0`;

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl border border-neutral-800 overflow-hidden">
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-black/70 rounded-full px-3 py-1">
        <span className="w-2 h-2 rounded-full bg-red-500 onair-blink" />
        <span className="text-xs font-black tracking-wider text-white">LIVE</span>
      </div>
      <iframe
        src={src}
        className="absolute inset-0 w-full h-full"
        allow="autoplay; encrypted-media"
        allowFullScreen
        title="テレビヒカマニ YouTube配信"
      />
    </div>
  );
}
