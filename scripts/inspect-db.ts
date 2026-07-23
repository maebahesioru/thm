import { prisma } from "../src/lib/db";

async function main() {
  const now = new Date();
  console.log("now:", now.toISOString(), "JST hour:", (now.getUTCHours() + 9) % 24);
  const grouped = await prisma.program.groupBy({ by: ["status"], _count: true });
  console.log("status counts:", JSON.stringify(grouped));
  const last = await prisma.program.findFirst({ orderBy: { endAt: "desc" } });
  console.log("last program endAt:", last?.endAt.toISOString());
  const currentSlot = await prisma.program.findFirst({
    where: { status: "scheduled", startAt: { lte: now }, endAt: { gt: now } },
    orderBy: { startAt: "asc" },
  });
  console.log("current slot:", currentSlot ? `${currentSlot.title} (${currentSlot.status})` : "none");
  const nextScheduled = await prisma.program.findFirst({
    where: { status: "scheduled" },
    orderBy: { startAt: "asc" },
  });
  console.log(
    "earliest scheduled:",
    nextScheduled ? `${nextScheduled.startAt.toISOString()} ${nextScheduled.title}` : "none",
  );
  const pending = await prisma.interruption.count({ where: { status: "pending" } });
  const queued = await prisma.queueItem.count({ where: { status: "queued" } });
  console.log("pending interruptions:", pending, "queued items:", queued);
  await prisma.$disconnect();
}

main();
