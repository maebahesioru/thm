import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { HLS_DIR } from "@/lib/config";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
};

// HLS配信ファイルの配信 (開発プレビュー用)
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segs } = await ctx.params;
  const rel = segs.join("/");
  const filePath = path.join(HLS_DIR, rel);

  if (!filePath.startsWith(HLS_DIR)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // m3u8がまだ無い → 空のライブプレイリストを返して待たせる
  if (path.extname(filePath) === ".m3u8" && (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile())) {
    const emptyPlaylist = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-TARGETDURATION:4",
      "#EXT-X-MEDIA-SEQUENCE:0",
    ].join("\n");
    return new NextResponse(emptyPlaylist, {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const ext = path.extname(filePath);
  const body = fs.readFileSync(filePath);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
