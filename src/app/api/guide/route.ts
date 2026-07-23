import { NextResponse } from "next/server";
import { getGuide, getNowAndNext } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const hours = Math.min(24, Math.max(1, Number(url.searchParams.get("hours") ?? 24)));
  const [programs, { nowAiring, next }] = await Promise.all([getGuide(hours), getNowAndNext()]);
  const serialize = (p: (typeof programs)[number]) => ({
    ...p,
    startAt: p.startAt.toISOString(),
    endAt: p.endAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
    tags: safeParseTags(p.tags),
  });
  return NextResponse.json({
    programs: programs.map(serialize),
    nowAiring: nowAiring ? serialize(nowAiring) : null,
    next: next ? serialize(next) : null,
    generatedAt: new Date().toISOString(),
  });
}

function safeParseTags(tags: string | null): string[] {
  try {
    return tags ? (JSON.parse(tags) as string[]) : [];
  } catch {
    return [];
  }
}
