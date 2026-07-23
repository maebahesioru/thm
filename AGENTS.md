# テレビヒカマニ (THM)

24時間ヒカマニ放送局。ニコニコ動画のヒカマニ系タグからランダム選曲して番組を編成し、
HIKAKIN/SEIKINのYouTube新着で緊急割り込みを行う配信ワーカー + 番組表サイト。

- 配信先: YouTube (本番はRTMP、開発はローカルHLSプレビュー)
- デプロイ先: Coolify (https://coolify.hikamer.f5.si/) ※まだデプロイしていない
- 公式サイト: http://hmtv.hikamer.f5.si/

## 技術構成

- Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + pnpm
- DB: SQLite + Prisma (`prisma/schema.prisma`、DBファイルは `data/thm.db`)
- 配信: ffmpeg (HLS or RTMP)、動画/コメント取得は yt-dlp
- 外部API: ニコニコ スナップショット検索API (認証不要)、YouTube RSS + yt-dlp/Innertube (APIキー不要)

## ディレクトリ

- `src/app/` … サイト (ページ + API Routes)
  - `/` 番組表 (最大24時間、Gガイド風縦タイムライン、録画予約=ブラウザ通知)
  - `/watch` HLS開発プレビュー (hls.js)
  - `/admin` 管理コントロールパネル (要ログイン)
  - `/api/stream/*` HLSファイル配信
- `src/lib/` … 共有ロジック
  - `config.ts` 環境設定・監視チャンネル・タグ一覧・時間帯編成(BANDS)
  - `scheduler.ts` 番組表生成 (時間帯タグ選曲・7日再放送禁止・CM挿入)
  - `niconico.ts` スナップショット検索 / `youtube.ts` RSS・watch情報・Innertube
  - `ticker.ts` テロップ / `auth.ts` 管理認証(HMAC Cookie)
- `src/streamer/` … 配信ワーカー (`pnpm stream`)
  - `engine.ts` 放送シーケンス (番組/キュー/割り込み/再開/番組表シフト)
  - `ffmpeg.ts` ffmpeg起動 (HLS/RTMP出力、テロップdrawtext、コメントASS焼き付け)
  - `monitor.ts` YouTube新着監視 (RSS、プレミア待機、ライブ除外)
  - `downloader.ts` yt-dlpラッパー / `overlay.ts` テロップ・ASS生成
- `scripts/` … 開発ユーティリティ (smoke-*, seed-*, reset-state, inspect-db)
- `data/` … 実行時データ (DB, HLS, キャッシュ, アップロード) ※git管理外

## コマンド

```bash
pnpm install        # 依存 + prisma generate (allowBuilds設定済: pnpm-workspace.yaml)
pnpm db:push        # DBスキーマ反映
pnpm dev            # サイト (http://localhost:3000)
pnpm stream         # 配信ワーカー
pnpm dev:all        # 両方
pnpm build          # 本番ビルド
pnpm tsc --noEmit   # 型チェック
```

## 環境変数 (.env.example 参照)

- `ADMIN_PASSWORD` 管理パネルログイン (初期値は開発用)
- `STREAM_MODE` `hls`(開発/既定) | `rtmp`(本番YouTube) | `simulate`(映像無し進行のみ)
- `YOUTUBE_STREAM_KEY` RTMP時必須
- `NICO_COOKIES` ニコニコ動画DL用 cookies.txt (無いとプレースホルダ映像で代用)
- `YT_COOKIES` YouTube bot対策回避用 cookies.txt (必要に応じて)
- `SCHEDULE_HORIZON_HOURS` 番組表の先行生成時間 (既定24)
- `REPLAY_NG_DAYS` 再放送禁止日数 (既定7)

## 重要な挙動

- **時間帯編成 (JST)**: 深夜=危険地帯/大腸編, 朝=教育/全年齢, 昼=ひとくち+CM多め,
  夕方=一般, ゴールデン=名作/バトル。タグで動画が無ければフォールバックタグへ
- **CM**: 番組間に「ヒカマニCMリンク」タグから自動挿入
- **新着割り込み**: @HikakinTV/@HikakinGames/@SeikinTV/@SeikinGames をRSS監視。
  検出→「緊急速報」テロップ+バンパー→新着動画→中断位置から再開。遅れ分は番組表をシフト。
  プレミア公開は開始時刻まで待機、ライブ配信は除外
- **キュー**: 管理パネルからmp4アップロード→現在の番組(または指定番組)の直後に放送
- **ニコニココメント**: yt-dlpで取得→ASS生成→右から左へ流れる表示で焼き付け

## 注意事項 (ハマりどころ)

- ffmpegがchocolatey shimの場合、`proc.kill`はshimだけ死に本体が残る。
  停止はstdinへの `q` 送信で行うこと (`src/streamer/ffmpeg.ts` 参照)
- lavfi入力には必ず `-re` を付ける (無いと最速エンコードで瞬間終了する)
- YouTubeはIPによってbot対策(LOGIN_REQUIRED)になる。メタ取得は yt-dlp→Innertube→HTML の順でフォールバック
- pnpm 11ではビルド承認は `pnpm-workspace.yaml` の `allowBuilds`/`onlyBuiltDependencies` に書く (package.jsonのpnpmフィールドは無効)
- 配信ワーカーは単一プロセスで動かすこと (状態はDBにあるが二重起動は二重放送になる)
