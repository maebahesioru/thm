// テスト用: 番組が airing になるのを待ってから割り込みを登録
import { prisma } from "../src/lib/db";

async function main() {
  const youtubeVideoId = process.argv[2] ?? "zzzzzzzzzzz";
  for (let i = 0; i < 300; i++) {
    const airing = await prisma.program.findFirst({ where: { status: "airing" } });
    if (airing) {
      // 5秒待ってから割り込み (再生途中を確実にする)
      await new Promise((r) => setTimeout(r, 5000));
      const item = await prisma.interruption.create({
        data: {
          channelId: "UCtest",
          channelTitle: "HikakinTV",
          youtubeVideoId,
          title: "テスト新着動画 (放送中割り込み検証)",
          status: "pending",
        },
      });
      console.log(`seeded during airing: ${airing.title} -> ${item.id}`);
      await prisma.$disconnect();
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log("no airing program within timeout");
  await prisma.$disconnect();
}

main();
