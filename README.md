# kanban-demo

GitHub Projects 風のシンプルなカンバンアプリ。個人ローカル利用を想定したミニマル実装です。

- 3 列固定（Todo / In Progress / Done）
- カードの追加・編集・削除
- ドラッグ & ドロップで列内 / 列間の並び替え
- データは SQLite ファイル (`prisma/dev.db`) に永続化
- 日本語 UI

## 技術スタック

| 役割 | 採用 |
| --- | --- |
| フレームワーク | Next.js 16 (App Router, Cache Components) |
| 言語 | TypeScript |
| UI | React 19 / Tailwind CSS v4 |
| データ層 | Prisma 7 + SQLite (`@prisma/adapter-better-sqlite3`) |
| ミューテーション | Server Actions + `updateTag('board')` |
| ドラッグ & ドロップ | `@dnd-kit/core` / `@dnd-kit/sortable` |

## セットアップ

```bash
npm install              # 依存をインストール（postinstall で prisma generate も実行）
npm run db:push          # SQLite DB を作成・スキーマ反映
npm run db:seed          # 3 列（Todo / In Progress / Done）をシード
npm run dev              # 開発サーバを起動
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開きます。

## スクリプト

| script | 説明 |
| --- | --- |
| `npm run dev` | 開発サーバ起動（Turbopack） |
| `npm run build` | プロダクションビルド |
| `npm start` | プロダクション起動 |
| `npm run lint` | ESLint |
| `npm run db:push` | Prisma スキーマを SQLite に反映 |
| `npm run db:seed` | 列をシード |

## ディレクトリ構成

```
app/
  page.tsx                  # Server Component。getBoard() で初期データ取得
  actions.ts                # Server Actions (use server) + updateTag
  layout.tsx
  _components/
    Board.tsx               # DndContext + 楽観的更新
    Column.tsx              # SortableContext + Droppable
    Card.tsx                # useSortable + インライン編集
    AddCardForm.tsx         # form action でカード追加
lib/
  prisma.ts                 # PrismaClient シングルトン
  board.ts                  # 'use cache' + cacheTag('board') の getBoard
prisma/
  schema.prisma             # Column / Card モデル
  seed.ts                   # 3 列の初期投入
prisma.config.ts            # Prisma 7 の datasource + adapter 設定
```

## 制限事項 / 今後の予定

- 認証なし（ローカル単一ユーザー前提）
- 列の追加・削除・並び替えは未対応（3 列固定）
- ダークモード、ラベル、担当者、Due 日、検索/フィルタは未対応
- Vercel など外部デプロイは未対応（SQLite 永続化のため）

## ライセンス

[MIT License](./LICENSE)
