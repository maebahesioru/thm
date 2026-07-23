import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [
    totalPrograms,
    totalCM,
    interruptions,
  ] = await Promise.all([
    prisma.playHistory.count({ where: { sourceType: { not: "niconico-cm" } } }),
    prisma.playHistory.count({ where: { sourceType: "niconico-cm" } }),
    prisma.interruption.count(),
  ]);

  const uniqueVideos = await prisma.playHistory.groupBy({ by: ["sourceId"], _count: true });

  // 総放送時間: done状態のprogramのdurationSec合計
  const durAgg = await prisma.program.aggregate({
    _sum: { durationSec: true },
    where: { status: "done" },
  });

  // 本日分
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDone = await prisma.program.count({ where: { status: "done", startAt: { gte: today } } });
  const todayCm = await prisma.program.count({ where: { status: "done", kind: "cm", startAt: { gte: today } } });
  const todaySec = await prisma.program.aggregate({
    _sum: { durationSec: true },
    where: { status: "done", startAt: { gte: today } },
  });

  return NextResponse.json({
    total: {
      programs: totalPrograms,
      cm: totalCM,
      durationSec: durAgg._sum.durationSec ?? 0,
      interruptions,
      uniqueVideos: uniqueVideos.length,
    },
    today: {
      programs: todayDone - todayCm,
      cm: todayCm,
      durationSec: todaySec._sum.durationSec ?? 0,
    },
  });
}
