// テスト用: 割り込み(新着)を手動で1件登録する
import { prisma } from "../src/lib/db";

async function main() {
  const youtubeVideoId = process.argv[2] ?? "xxxxxxxxxxx";
  const item = await prisma.interruption.create({
    data: {
      channelId: "UCtest",
      channelTitle: "HikakinTV",
      youtubeVideoId,
      title: "テスト新着動画 (割り込み検証)",
      status: "pending",
    },
  });
  console.log("seeded interruption:", item.id);
  await prisma.$disconnect();
}

main();
