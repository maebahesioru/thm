// テスト用: 状態リセット (airing残留の解消・保留割り込みの削除)
import { prisma } from "../src/lib/db";

async function main() {
  const a = await prisma.program.updateMany({ where: { status: "airing" }, data: { status: "scheduled" } });
  const b = await prisma.interruption.deleteMany({ where: { status: { in: ["pending", "airing"] } } });
  const c = await prisma.queueItem.updateMany({ where: { status: "airing" }, data: { status: "queued" } });
  console.log(`reset: program airing->scheduled ${a.count}, interruptions deleted ${b.count}, queue ${c.count}`);
  await prisma.$disconnect();
}

main();
