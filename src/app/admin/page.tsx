import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { StatusPanel } from "@/components/admin/StatusPanel";
import { StatsDashboard } from "@/components/admin/StatsDashboard";
import { TickerAdmin } from "@/components/admin/TickerAdmin";
import { UploadForm } from "@/components/admin/UploadForm";
import { QueueAdmin } from "@/components/admin/QueueAdmin";
import { InterruptionLog } from "@/components/admin/InterruptionLog";
import { HistoryLog } from "@/components/admin/HistoryLog";
import { LogoutButton } from "@/components/admin/LogoutButton";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdmin())) redirect("/login");

  const [tickers, queue, interruptions, upcoming] = await Promise.all([
    prisma.ticker.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.queueItem.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.interruption.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.program.findMany({
      where: { endAt: { gt: new Date() }, status: { in: ["scheduled", "airing"] } },
      orderBy: { startAt: "asc" },
      take: 50,
      select: { id: true, title: true, startAt: true, endAt: true },
    }),
  ]);

  const iso = <T extends { createdAt: Date }>(o: T) => ({ ...o, createdAt: o.createdAt.toISOString() });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">管理コントロールパネル</h1>
        <LogoutButton />
      </div>

      <StatusPanel />

      <section>
        <h2 className="text-lg font-bold mb-2">放送実績</h2>
        <StatsDashboard />
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">THMニュース速報テロップ</h2>
        <TickerAdmin
          initial={tickers.map((t) => ({
            ...iso(t),
            expiresAt: t.expiresAt?.toISOString() ?? null,
          }))}
        />
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">mp4アップロード → 番組後に放送</h2>
        <p className="text-xs text-neutral-500 mb-3">
          「現在の番組が終わったら」を選ぶと、放送中の番組の直後に挿入されます。週/月イチの自作ニュース番組などに。
        </p>
        <UploadForm
          programs={upcoming.map((p) => ({
            id: p.id,
            title: p.title,
            startAt: p.startAt.toISOString(),
            endAt: p.endAt.toISOString(),
          }))}
        />
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">放送キュー</h2>
        <QueueAdmin initial={queue.map((q) => iso(q))} />
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">新着割り込みログ (HIKAKIN/SEIKIN)</h2>
        <InterruptionLog
          initial={interruptions.map((i) => ({ ...iso(i), publishAt: i.publishAt?.toISOString() ?? null }))}
        />
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">放送履歴</h2>
        <HistoryLog />
      </section>
    </div>
  );
}
