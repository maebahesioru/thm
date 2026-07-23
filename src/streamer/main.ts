import "dotenv/config";
import fs from "fs";
import { DATA_DIR, HLS_DIR, UPLOAD_DIR, CACHE_DIR, OVERLAY_DIR } from "../lib/config";
import { Engine } from "./engine";
import { startMonitor } from "./monitor";

async function main() {
  // 前回セッションのHLS残骸を掃除 (セグメント番号のリセット)
  fs.rmSync(HLS_DIR, { recursive: true, force: true });
  for (const d of [DATA_DIR, HLS_DIR, UPLOAD_DIR, CACHE_DIR, OVERLAY_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
  console.log("[thm] テレビヒカマニ 配信ワーカー起動");

  // YouTube新着監視 (バックグラウンド)
  startMonitor().catch((e) => console.error("[thm] monitor起動失敗:", e));

  // 配信エンジン
  const engine = new Engine();
  await engine.run();
}

main().catch((e) => {
  console.error("[thm] fatal:", e);
  process.exit(1);
});
