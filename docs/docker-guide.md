# Docker入門 — 製パンラインカンバンで学ぶコンテナ化と配布

対象読者: プログラミング経験はあるが、これまで個人PC上でしか開発・実行したことがない技術者。
ゴール: 自分が作った Next.js アプリを Docker イメージにして、社内の他メンバーにも同じ環境で操作・レビューしてもらえるようになること。

本レポートは、実際にこのリポジトリ（製パンライン カンバン）を題材に、Dockerfile を書いて `docker build` / `docker run` まで動作確認した内容をベースにしています。

---

## 前提条件（重要）

このアプリを Docker 化する前に、まず手元で `npm run build` が成功することを確認してください。

> 補足: 過去に `prisma.config.ts` の型エラー（`PrismaConfig`型に存在しない`adapter`フィールドを指定していた）で `npm run build` が失敗する時期がありましたが、これは Docker とは無関係な問題で、`prisma.config.ts` から不要な `adapter` フィールドを削除済みです。ランタイム側のドライバアダプタ設定（`lib/prisma.ts`）には影響しません。

---

## 第1部 Dockerとは何か（概念編）

### 1. なぜDockerが必要か

個人のPCでアプリを作っていると、次のような会話が起きがちです。

> 「動かないんだけど」「え、自分の環境では動きますよ」

原因は大抵、Node.jsのバージョン差、OSの違い（Windows/Mac/Linux）、グローバルにインストールした何かのライブラリの有無など、**「コードの外側」の環境差**です。

Dockerは、アプリ本体だけでなく「そのアプリが動くために必要な環境一式（OS・ランタイム・ライブラリ・設定）」を1つの箱（コンテナ）に詰めて配れるようにする技術です。「自分のPCでは動く」を「箱ごと渡すので誰の環境でも動く」に変えます。

### 2. 仮想マシンとの違い

| | 仮想マシン(VM) | Dockerコンテナ |
|---|---|---|
| 中身 | ゲストOSを丸ごと積む | ホストのOSカーネルを共有し、プロセスを隔離する |
| 起動時間 | 数十秒〜数分 | 数百ミリ秒〜数秒 |
| サイズ | 数GB〜 | 数十〜数百MB程度が一般的 |
| 用途の例 | 全く違うOSを動かす | 「このアプリ用の隔離された実行環境」を素早く量産する |

VMは「コンピュータそのものを複製する」イメージ、コンテナは「アプリ実行に必要な部分だけを軽量に切り出す」イメージです。今回のように「1つのWebアプリを配りたい」という用途では、コンテナの方が圧倒的に軽量・高速です。

### 3. 重要な3つの概念

- **イメージ (Image)**: アプリと実行環境一式を固めた「設計図・雛形」。読み取り専用。
- **コンテナ (Container)**: イメージから実際に起動した「実行中のインスタンス」。1つのイメージから何個でもコンテナを起動できる。
- **レジストリ (Registry)**: イメージを保管・配布する場所（Docker Hub、GitHub Container Registry など）。`push`で登録し、`pull`で取得する。

クラス（イメージ）とインスタンス（コンテナ）の関係に近いです。

### 4. 全体の流れ

```
Dockerfile ──(docker build)──> イメージ ──(docker run)──> コンテナ（動いているアプリ）
                                   │
                                   ├──(docker push)──> レジストリ ──(docker pull)──> 他の人のPC
                                   │
                                   └──(docker save)──> tarファイル ──(docker load)──> 他の人のPC
```

- `Dockerfile`: 「どうイメージを組み立てるか」を書いた設計図（テキストファイル）
- `docker build`: Dockerfileからイメージを作る
- `docker run`: イメージからコンテナを起動する
- 配布方法は2通り（レジストリ経由 / ファイルで直接渡す）。詳しくは第3部で扱う

---

## 第2部 自分のアプリをDocker化する（実践編）

### 5. このアプリの技術構成とDocker化のポイント

| 要素 | 内容 | Docker化での注意点 |
|---|---|---|
| フレームワーク | Next.js 16 (App Router) | `output: "standalone"` で最小構成の実行イメージを作れる |
| DB | SQLite（`prisma/dev.db`） | ファイルなのでコンテナの外に永続化（ボリューム）が必要 |
| ORM | Prisma 7 + `better-sqlite3`（ネイティブアドオン） | ビルド時にコンパイル/プリビルドバイナリの取得が発生する |
| ビルド時のDBアクセス | ダッシュボード等が `cacheComponents` で事前レンダリングされ、ビルド中にDBへクエリする | ビルド前にスキーマを流し込んでおく必要がある（後述） |

#### Next.jsを`standalone`出力にする

`next.config.ts` に1行追加します。これにより `node_modules` を丸ごとコピーせずに、実行に必要な最小限のファイルだけを含む `.next/standalone` フォルダが生成されます。

```ts
// next.config.ts
const nextConfig: NextConfig = {
  cacheComponents: true,
  transpilePackages: ["mic-test"],
  output: "standalone", // 追加
};
```

> 補足: ネイティブアドオン（`better-sqlite3`）の `.node` バイナリは、検証した範囲では追加設定なしで自動的に `standalone` 出力へ含まれました。もし別環境で `MODULE_NOT_FOUND` のようなエラーが出た場合は、Next.js公式ドキュメントが案内している以下の設定を試してください。
>
> ```ts
> outputFileTracingIncludes: {
>   "/*": ["node_modules/better-sqlite3/**/*"],
> },
> ```

### 6. Dockerfileを書く

このアプリで実際に動作確認できた3段階（マルチステージ）のDockerfileです。

```dockerfile
# --- 依存関係のインストール ---
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# --- ビルド ---
FROM node:24-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# ダッシュボード等がビルド時にDBへ静的プリレンダリングでアクセスするため、
# next build の前にスキーマだけ流し込んでおく（データは空でよい）
RUN npx prisma db push
RUN npm run build

# --- 実行 ---
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
```

なぜ3段階に分けるか:

- **deps**: 依存関係のインストールだけを切り出すことで、ソースコードだけ変更した際に `npm ci` をキャッシュから再利用できる（ビルドが速くなる）
- **builder**: 実際にNext.jsのビルドを行う。ここで使うTypeScriptやツール類は最終イメージには残らない
- **runner**: 実行に必要な最小限のファイルだけをコピーした「本番用の身軽な箱」

3つの実務上の落とし穴（実際に遭遇したもの）:

1. **`node:24-slim`を使う** — Debian系ベース（glibc）。`better-sqlite3` はプリビルド済みバイナリを取得するため、追加のビルドツール無しでも動作を確認できました。Alpine（musl libc）は未検証のため、使う場合はビルドが失敗しないか事前に確認してください。
2. **`next build` の前に `npx prisma db push` が必須** — このアプリはダッシュボードなどのページを**ビルド時に静的プリレンダリング**しており、その際に実際にDBへクエリを投げます。DBファイルにテーブルが1つも無い状態で `next build` すると、`P2021 (table does not exist)` エラーでビルドごと失敗します。
3. **非rootユーザーで実行する場合は `COPY --chown` を使う** — `USER nextjs` で実行するコンテナに対し、`/app/prisma` を所有者指定なしでコピーすると、SQLiteへの書き込み時に `attempt to write a readonly database` エラーになります。`COPY --from=builder --chown=nextjs:nodejs ...` で解決します。

`.dockerignore` も忘れずに用意します。

```
node_modules
.next
.git
*.md
docs
prisma/dev.db
prisma/dev.db-journal
.env*
```

### 7. `docker build` / `docker run` を実際に叩く

```bash
# イメージをビルド（-t でタグ＝名前を付ける）
docker build -t kanban-demo .

# コンテナを起動（-d: バックグラウンド、-p: ポート転送、-e: 環境変数）
docker run -d --name kanban -p 3000:3000 -e ALLOW_DB_RESET=true kanban-demo
```

ブラウザで `http://localhost:3000` を開くと、コンテナ内で動くアプリにアクセスできます。

```bash
docker logs kanban        # 起動ログを見る
docker ps                 # 動いているコンテナ一覧
docker stop kanban         # 停止
docker rm kanban           # コンテナを削除（イメージは残る）
```

初回起動時はDBが空（スキーマのみ）なので、画面右上の「サンプルをリセット」ボタン（`POST /api/db-reset`）でサンプルデータを投入できます。本番相当（`NODE_ENV=production`）では `ALLOW_DB_RESET=true` を明示しないとこの操作は403で拒否される仕様（`app/api/db-reset/route.ts`）なので、動作確認用にコンテナへこの環境変数を渡しています。

### 8. 状態の永続化 — SQLiteファイルをどう扱うか

コンテナを削除すると、その中に書き込んだデータ（SQLiteファイル）も一緒に消えます。データを残したい場合は、コンテナの外（ボリューム）にDBファイルを逃がします。

**推奨: 名前付きボリューム（named volume）を使う**

```bash
docker volume create kanban-data
docker run -d --name kanban -p 3000:3000 \
  -e ALLOW_DB_RESET=true \
  -v kanban-data:/app/prisma \
  kanban-demo
```

名前付きボリュームは初回マウント時に**イメージ側に元々あった内容（今回はスキーマ適用済みの空DB）を自動的にコピーしてくれる**ため、そのまま動作します。これは検証で確認済みの挙動です。

```bash
docker rm -f kanban
docker run -d --name kanban -p 3000:3000 -v kanban-data:/app/prisma kanban-demo
# → コンテナを作り直しても、ボリューム内のデータはそのまま残る
```

**注意: ホストのディレクトリを直接バインドマウントする場合**

```bash
# 空のホストディレクトリをそのままマウントすると…
docker run -v ./my-empty-dir:/app/prisma -p 3000:3000 kanban-demo
```

この場合、ホスト側の空ディレクトリの中身で `/app/prisma` が**丸ごと上書き**され、イメージに焼き込んだスキーマ済みDBが見えなくなります。結果、`table does not exist` エラーになります（実際に検証で再現しました）。バインドマウントを使いたい場合は、先に `docker cp` などでDBファイルをホスト側に用意しておくか、素直に名前付きボリュームを使ってください。

### 9. 環境変数の扱い

| 変数 | 用途 | 備考 |
|---|---|---|
| `PORT` | リッスンポート | `standalone`出力の`server.js`が読む。既定3000 |
| `HOSTNAME` | バインドアドレス | コンテナ内では `0.0.0.0` にしないと外から繋がらない |
| `ALLOW_DB_RESET` | 本番相当環境でのサンプルリセット許可 | `true`以外は403（`app/api/db-reset/route.ts`） |
| `LLAMA_URL` / `LLAMA_MODEL` | 音声コマンド機能が使うローカルLLMサーバの接続先 | 任意機能。コンテナからホストのLLMサーバへ繋ぐ場合、Mac/Windowsは`http://host.docker.internal:8080`、Linuxは`docker run --add-host=host.docker.internal:host-gateway ...`が必要 |

環境変数は `docker run -e KEY=VALUE` で1つずつ渡すか、`--env-file .env.production` でまとめて渡せます。

### 10. `docker-compose` で起動をシンプルにする（任意）

コマンドが長くなってきたら、`docker-compose.yml` に設定をまとめておくと便利です。

```yaml
services:
  kanban:
    build: .
    image: kanban-demo:latest
    ports:
      - "3000:3000"
    environment:
      - ALLOW_DB_RESET=true
    volumes:
      - kanban-data:/app/prisma

volumes:
  kanban-data:
```

```bash
docker compose up -d --build   # ビルドして起動
docker compose logs -f         # ログを追う
docker compose down            # 停止（-v を付けるとボリュームも削除）
```

`docker run` の長いオプション列を毎回打たなくて済み、チームメンバーへの共有もしやすくなります（後述の配布方法と組み合わせて使えます）。

---

## 第3部 社内のメンバーに渡す（配布・共有編）

イメージを「渡す」方法は大きく2つあります。

### 11. 方法A: ファイルで直接渡す（`docker save` / `docker load`）

社内共有フォルダやUSBメモリ、チャットへのファイル添付などで直接渡したい場合に使います。レジストリ（後述）のセットアップが不要な最も手軽な方法です。

```bash
# 渡す側: イメージをtarファイルに固める（gzip圧縮すると軽くなる）
docker save kanban-demo | gzip > kanban-demo.tar.gz

# 受け取る側: tarファイルからイメージを読み込む
docker load < kanban-demo.tar.gz
```

検証では、圧縮後のファイルサイズは約92MB（イメージ本体は約420MB）でした。社内共有であればメールよりファイルサーバやチャットツールでの共有が現実的です。

### 12. 方法B: レジストリ経由で渡す（Docker Hub / GitHub Container Registry など）

複数人・複数環境に継続的に配りたい場合や、CIから自動でイメージを更新したい場合はこちらが向いています。

```bash
# タグ付け（レジストリのアカウント名を含める）
docker tag kanban-demo ghcr.io/<your-account>/kanban-demo:latest

# ログインしてpush（渡す側・一度だけ）
docker login ghcr.io
docker push ghcr.io/<your-account>/kanban-demo:latest

# 受け取る側はpullするだけ
docker pull ghcr.io/<your-account>/kanban-demo:latest
```

社内限定で使うなら、GitHub Container Registry のリポジトリをPrivateにし、メンバーをアクセス許可すれば十分です。Docker Hubも同様の使い方ができます（無料枠はPrivateリポジトリ数に制限あり）。

| | ファイルで直接渡す (`save`/`load`) | レジストリ経由 (`push`/`pull`) |
|---|---|---|
| 事前準備 | ほぼ不要 | レジストリのアカウント・権限設定が必要 |
| 更新の配布 | 都度ファイルを渡し直す | `pull`するだけで最新版に更新できる |
| 向いている場面 | 単発の共有、社外に出せない環境 | 継続的な開発・複数人での利用、CI/CD連携 |

### 13. 受け取った側の操作

どちらの方法でイメージを受け取っても、その後の操作は同じです。

```bash
# イメージが手元にあることを確認
docker images

# 起動（名前付きボリュームでデータを残す）
docker volume create kanban-data
docker run -d --name kanban -p 3000:3000 \
  -e ALLOW_DB_RESET=true \
  -v kanban-data:/app/prisma \
  kanban-demo:latest
```

ブラウザで `http://localhost:3000` を開けば、渡した側と全く同じアプリが動きます。Node.jsのバージョン差やライブラリの入れ忘れを気にする必要はありません。

### 14. レビュー体制としての意味

このワークフローが整うと、次のようなことが可能になります。

- コードを読めないレビュアーでも、実際にアプリを触って動作確認・フィードバックできる
- 「私の環境では再現しない」という水掛け論がなくなる（同じイメージ＝同じ環境）
- QA担当者に、ソースコードやNode.js環境を渡さずに「動くもの」だけを渡せる
- 複数バージョンを並行して比較したい場合も、ポート番号を変えて複数コンテナを同時起動するだけでよい

---

## 第4部 付録

### 15. よく使うコマンドチートシート

```bash
# イメージ
docker build -t <名前> .              # Dockerfileからイメージを作る
docker images                         # イメージ一覧
docker rmi <イメージ名>                # イメージを削除

# コンテナ
docker run -d --name <名前> -p 3000:3000 <イメージ名>
docker ps                             # 動いているコンテナ一覧
docker ps -a                          # 停止中も含めた全コンテナ
docker logs -f <コンテナ名>            # ログをリアルタイム表示
docker exec -it <コンテナ名> sh        # コンテナ内でシェルを開く
docker stop <コンテナ名>               # 停止
docker rm <コンテナ名>                 # 削除

# ボリューム
docker volume create <名前>
docker volume ls
docker volume rm <名前>

# 配布
docker save <イメージ名> | gzip > out.tar.gz
docker load < out.tar.gz
docker tag <イメージ名> <registry>/<image>:<tag>
docker push <registry>/<image>:<tag>
docker pull <registry>/<image>:<tag>

# compose
docker compose up -d --build
docker compose down -v
```

### 16. トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `next build` が `prisma.config.ts` の型エラーで失敗する | Prisma 7.8.0で`PrismaConfig`型から`adapter`が削除された | Docker化以前の問題。先に修正する（本レポート冒頭「前提条件」参照） |
| `next build` 中に `P2021: table does not exist` | ビルド時の静的プリレンダリングがDBへクエリするのに、DBが空 | Dockerfileの`builder`ステージで`next build`の前に`npx prisma db push`を実行する |
| コンテナ起動後、DBへの書き込みで `attempt to write a readonly database` | 非rootユーザーで実行しているのに、コピーしたファイルの所有者がrootのまま | `COPY --chown=<user>:<group>` を使う |
| ボリュームをマウントしたら急に `table does not exist` になった | ホストの空ディレクトリをバインドマウントし、イメージ内のDBが隠れた | 名前付きボリュームを使うか、事前にホスト側へDBを用意する |
| `ports are not available: address already in use` | ホスト側の指定ポートが別プロセス（例: `npm run dev`）に使われている | `-p <別のポート>:3000` のようにホスト側のポートを変える |
| `POST /api/db-reset` が403を返す | 本番相当環境（`NODE_ENV=production`）で`ALLOW_DB_RESET`が未設定 | `-e ALLOW_DB_RESET=true` を付けて起動する |

### 17. このアプリ特有の注意点まとめ

- **ネイティブアドオン（`better-sqlite3`）**: `npm ci`時にプリビルド済みバイナリを取得する。プラットフォーム（OS/CPUアーキテクチャ）が変わると再取得・再ビルドが必要になる場合がある
- **DBファイルの扱い**: `prisma/dev.db` は環境変数で変更できない固定パス（`process.cwd()`基準）。ボリュームは必ず `/app/prisma` （またはそのファイル）に向ける
- **ビルド時のDBアクセス**: `cacheComponents`によるダッシュボード等の静的プリレンダリングがビルド中にDBへ問い合わせる。ビルド前にスキーマ適用が必須
- **音声機能（LLM連携）はデモ用途**: 社内配布したイメージ単体では動作しない（別途ローカルLLMサーバが必要）。レビュー用途では気にしなくてよい機能
