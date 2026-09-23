# 製パンライン カンバン

製パン工場の製造ラインを管理する Next.js 製カンバンアプリ。仕込みから出荷までの11工程をバッチ単位でドラッグ&ドロップ管理し、音声操作・Bluetoothイヤホン連携・KPIダッシュボードまで備えたデモ実装です。

- **11工程固定**: 仕込 → 一次発酵 → 分割・丸め → ベンチタイム → 成形 → 二次発酵 → 焼成 → 冷却 → 包装 → 検品 → 出荷
- バッチ（製造ロット）の追加・編集・工程間移動（ドラッグ&ドロップ）
- 工程ごとの標準時間・滞留時間・標準超過アラート表示
- 音声コマンドでバッチを次工程へ移動。マイクは常時オンのまま発話区間を自動検出（VAD）し、操作指示ではない発話は TypeSafe AI「Jev」の判定で自動的に聞き流す
- 「録音」ボタン（Bluetoothイヤホン連携も同時に有効化）または物理ボタンで開始/停止・リセット（Shokz OpenFit 2+ で動作確認）
- ダッシュボード（本日のKPI・要注意バッチ・製品別/アレルゲン別集計）
- 振り返りKPI（過去7日の出荷数・リードタイム・品質合格率・ボトルネック工程）
- DBインスペクタ（SQLiteの中身をそのまま閲覧）
- サンプルデータをワンクリックで再生成（本番環境ではデフォルト無効）
- データは SQLite ファイル (`prisma/dev.db`) に永続化
- 日本語 UI

## 技術スタック

| 役割 | 採用 |
| --- | --- |
| フレームワーク | Next.js 16 (App Router, Cache Components) |
| 言語 | TypeScript |
| UI | React 19 / Tailwind CSS v4 |
| データ層 | Prisma 7 + SQLite (`@prisma/adapter-better-sqlite3` / `better-sqlite3`) |
| ミューテーション | Server Actions + `updateTag('board')` |
| ドラッグ & ドロップ | `@dnd-kit/core` / `@dnd-kit/sortable` |
| 音声入力（文字起こし） | whisper-server（whisper.cpp、要 `--convert`）。マイクは常時オン、音量ベースのVADで発話区間ごとに `MediaRecorder` で録音・送信 |
| 音声入力（解釈） | TypeSafe AI「Jev」 |
| BT連携・TTS | [`mic-test`](https://github.com/Takashi-Matsumura/mic-test)（GitHub直接依存、Media Session API経由のAVRCP制御） |

## セットアップ

```bash
npm install              # 依存をインストール（postinstall で prisma generate も実行）
npm run db:push          # SQLite DB を作成・スキーマ反映
npm run db:seed          # 11工程・製品・アレルゲン・設備・サンプルバッチをシード
npm run dev              # 開発サーバを起動
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開きます。シードデータは実行日基準で動的生成されるため、いつ実行しても「本日分」のバッチとして表示されます。

### 音声入力を使う場合（任意）

音声コマンドは「文字起こし（発話→テキスト）」と「解釈（テキスト→操作）」の2段階です。

#### 文字起こし（Whisper）

音声操作デモは [whisper.cpp](https://github.com/ggml-org/whisper.cpp) の `whisper-server` が別途起動している前提です。未起動の場合、音声入力の開始は失敗します（カンバン本体の操作には影響しません）。

```bash
brew install whisper-cpp ffmpeg
# モデルは別途用意する（例: ggml-large-v3-turbo-q5_0.bin を ~/.local/share/whisper-models/ 等に配置）
whisper-server -m /path/to/ggml-large-v3-turbo-q5_0.bin --host 127.0.0.1 --port 8090 -l ja --convert
```

`--convert`（ffmpeg 変換）は、ブラウザの `MediaRecorder` が出力する webm/opus 形式を受け付けるために必須です。

```bash
WHISPER_URL=http://localhost:8090 # 既定値。whisper-server のエンドポイント
```

ブラウザ→`/api/transcribe`（Next.js）→`whisper-server` の順に中継し、CORS を回避している。

**常時録音・自動発話区間検出（VAD）**: 「録音」を押すと（対応環境ではBT連携も同時に有効化して）マイクを開いたままにし、`app/_components/useWhisperRecognition.ts` が音量（RMS）ベースの簡易VADで発話の開始・終了を自動検出する。無音が一定時間（既定 900ms）続いたところで発話区間を確定し、その区間だけを `whisper-server` に送って文字起こし・解釈する。逐次の途中結果表示はなく、区間ごとにまとめて結果が届く。ボタン操作は不要になるが、しきい値（`RMS_THRESHOLD` = 0.02）は環境音レベルによって調整が必要になる場合がある。操作指示ではないと判定された発話（雑談・雑音等）は静かに聞き流し、次の発話を待つ。

#### 解釈エンジン（Jev）

音声コマンドは [TypeSafe AI](https://typesafe.ai) の Jev を使って解釈します。`.env.local` に API キーを設定してください。

```bash
TYPESAFE_API_KEY=your-api-key   # https://typesafe.ai で発行したキー
```

Jev の確信度に応じて挙動が変わります。

| 確信度 | 挙動 |
| --- | --- |
| 85% 以上 | 自動実行 |
| 60〜85% | 確認してから実行（画面の[実行]/[取消]、または BT イヤホンのシングル/ダブルクリック） |
| 60% 未満 | 実行せず聞き流す |

## スクリプト

| script | 説明 |
| --- | --- |
| `npm run dev` | 開発サーバ起動（Turbopack） |
| `npm run build` | プロダクションビルド |
| `npm start` | プロダクション起動 |
| `npm run lint` | ESLint |
| `npm run db:push` | Prisma スキーマを SQLite に反映 |
| `npm run db:seed` | 工程・製品・アレルゲン・設備・サンプルバッチをシード |

画面右上の「サンプルをリセット」ボタンからも同じシード処理を再実行できます（`POST /api/db-reset`）。本番環境（`NODE_ENV=production`）では `ALLOW_DB_RESET=true` を明示しない限り 403 で拒否されます。

## 画面構成

![工程詳細画面（/board）](./docs/images/board-screenshot.png)

| パス | 画面 | 概要 |
| --- | --- | --- |
| `/` | ダッシュボード | 本日のKPI、要注意バッチ、製品別/アレルゲン別グラフ、工程フロー |
| `/board` | 工程詳細 | バッチをドラッグ&ドロップで工程間移動。音声入力・BT連携バーもここ |
| `/kpi` | 振り返り | 過去7日の出荷数・平均リードタイム・品質合格率・工程別ボトルネック |
| `/db` | データベース | SQLite の全テーブルを閲覧できるデモ用インスペクタ |

## データモデル（`prisma/schema.prisma`）

| テーブル | 役割 |
| --- | --- |
| `Column` | 工程（11工程固定）。name / stageType / 標準所要時間など |
| `Product` | 製品マスタ（角食パン、フランスパン等） |
| `Allergen` / `ProductAllergen` | アレルゲンマスタと製品の中間テーブル |
| `Equipment` | 設備マスタ（ミキサー、ホイロ、オーブン等） |
| `Card` | バッチ（製造ロット）。製品・設備・数量・担当者・優先度・目標完了時刻など |
| `StageHistory` | 工程ごとの滞留履歴（滞在時間の記録） |
| `QualityCheck` | 品質チェック結果 |

## 音声入力・BT連携の仕組み

1. `useWhisperRecognition` が `getUserMedia` でマイクを常時開いたまま、音量ベースのVADで発話区間を自動検出。発話ごとに `MediaRecorder` で区間を録音し、無音がしばらく続いたら確定して `/api/transcribe` へ送信。同ルートが `whisper-server` の `/inference` へ中継して文字起こしする（逐次の途中結果表示はなし。区間ごとにまとめて結果が届く）
2. `lib/voice-dictionary.ts` で製パン用語の同音異義語誤変換を補正（例: 「整形」→「成形」）
3. `app/api/voice-command/route.ts` が Jev へ問い合わせ、対象バッチと移動先工程を解決。操作指示ではないと判定された発話（常時録音中に拾う雑談・雑音等）は静かに聞き流し、次の発話区間の検出を続ける
4. Jev の確信度が高ければそのまま、中程度なら画面確認を経て `moveCard`（Server Action）を実行。処理が終わるとしばらくして自動的に聞き取り状態へ戻る
5. 画面の「録音」ボタンはBT連携の有効化/無効化と録音の開始/停止をまとめて行う。有効化中は `mic-test/openfit` の `useOpenFit` がBluetoothイヤホンの物理ボタン（シングルクリック=録音 ON/OFF or 確認時は実行、ダブルクリック=リセット or 確認時は取消）をAVRCP経由で購読し、`mic-test/tts` が結果を読み上げ

## ディレクトリ構成

```
app/
  page.tsx                    # / ダッシュボード
  layout.tsx                  # AppHeader + フォント設定
  actions.ts                  # Server Actions（createBatch, moveCard, addQualityCheck 等）+ updateTag
  board/page.tsx               # /board 工程詳細
  kpi/page.tsx                  # /kpi 振り返りKPI
  db/page.tsx                    # /db DBインスペクタ
  api/
    voice-command/route.ts     # テキスト→Jev解釈API
    transcribe/route.ts        # 録音データ→whisper-server中継API
    db-reset/route.ts          # サンプルデータ再生成API
  _components/
    AppHeader.tsx              # ナビゲーション + サンプルリセットボタン
    Board.tsx                  # DndContext + 音声/BT連携バーの統合
    Column.tsx / Card.tsx      # 工程列 / バッチカード
    CardDetail.tsx              # バッチ詳細（基本/品質/工程履歴/メモの4タブ）
    AddCardForm.tsx
    StageFlow.tsx               # 本日の製造フロー可視化
    StageTimer.tsx               # 標準時間・目標時刻カウントダウン
    DbInspector.tsx               # テーブル一覧表示
    useWhisperRecognition.ts     # マイク録音 + whisper-server連携フック
    useLatestRef.ts               # イベントハンドラで最新値を参照するためのref同期フック
lib/
  prisma.ts                    # PrismaClient シングルトン（better-sqlite3 アダプタ）
  board.ts / dashboard.ts / kpi.ts / db-snapshot.ts   # 'use cache' + cacheTag('board') のデータ取得
  stage-equipment.ts            # 工程⇔設備種別マッピング
  voice-dictionary.ts            # 音声認識の同音異義語補正辞書
  voice/
    jev.ts                        # Jev への問い合わせ・解釈
    types.ts                       # 型定義
prisma/
  schema.prisma                 # データモデル定義
  seed.ts                        # CLIシードエントリ（npm run db:seed）
  seedData.ts                     # 実際のシード処理（実行日基準で動的生成）
prisma.config.ts                # Prisma 7 の datasource + adapter 設定
```

## 制限事項 / 今後の予定

- 認証なし（ローカル単一ユーザー前提）
- 工程（11工程）の追加・削除・並び替えUIは未対応（シードで固定）
- ダークモード、検索/フィルタは未対応
- SQLite ファイル永続化に依存するため、Vercel など多くのサーバーレス環境ではそのままデプロイ不可
- 音声入力は文字起こしに whisper-server、解釈に Jev API が必須。未起動/未設定時は音声コマンドのみエラーになる
- BT連携は Shokz OpenFit 2+ での動作確認のみ。Media Session API の制約上、音量ボタンなど一部操作は受信不可
- `mic-test` は npm 未公開の GitHub 直接依存（別リポジトリで管理）

## ライセンス

[MIT License](./LICENSE)
