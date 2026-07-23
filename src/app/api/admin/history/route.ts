import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const history = await prisma.playHistory.findMany({
    orderBy: { playedAt: "desc" },
    take: limit,
  });
  return NextResponse.json({
    history: history.map((h) => ({
      ...h,
      playedAt: h.playedAt.toISOString(),
    })),
  });
}
