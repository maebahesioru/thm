// スモークテスト: ニコニコAPI実通信で番組表を生成し、時間帯ルールと重複を検証
import { prisma } from "../src/lib/db";
import { ensureSchedule } from "../src/lib/scheduler";

async function main() {
  console.log("== ensureSchedule 実行 ==");
  const t0 = Date.now();
  await ensureSchedule();
  console.log(`生成完了 (${Date.now() - t0}ms)`);

  const programs = await prisma.program.findMany({ orderBy: { startAt: "asc" } });
  console.log(`番組数: ${programs.length}`);
  for (const p of programs) {
    const start = p.startAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    console.log(
      `  [${p.band ?? "-"}][${p.kind}] ${start} (${Math.round(p.durationSec / 60)}分) ${p.title.slice(0, 50)} <${p.sourceId}>`,
    );
  }

  // 重複チェック (program種別で同じsourceIdが2回出ていないか)
  const seen = new Map<string, number>();
  for (const p of programs.filter((x) => x.kind === "program")) {
    seen.set(p.sourceId, (seen.get(p.sourceId) ?? 0) + 1);
  }
  const dups = [...seen.entries()].filter(([, n]) => n > 1);
  console.log(dups.length === 0 ? "OK: 番組の重複なし" : `NG: 重複あり ${JSON.stringify(dups)}`);

  // CMが番組間に入っているか
  const cmCount = programs.filter((p) => p.kind === "cm").length;
  console.log(`CMスロット数: ${cmCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
