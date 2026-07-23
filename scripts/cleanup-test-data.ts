// テストデータの掃除 (テスト割り込み・期限切れテロップ等)
import { prisma } from "../src/lib/db";

async function main() {
  const a = await prisma.interruption.deleteMany({ where: { channelId: "UCtest" } });
  const b = await prisma.ticker.deleteMany({ where: { text: { contains: "テスト" } } });
  console.log(`deleted: test interruptions=${a.count}, test tickers=${b.count}`);
  await prisma.$disconnect();
}

main();
