import { getBoard, getProducts } from "@/lib/board";
import { getDbSnapshot } from "@/lib/db-snapshot";
import { Board } from "./_components/Board";
import { DbInspector } from "./_components/DbInspector";

export default async function Home() {
  const [columns, products, snapshot] = await Promise.all([
    getBoard(),
    getProducts(),
    getDbSnapshot(),
  ]);
  const total = columns.reduce((sum, col) => sum + col.cards.length, 0);

  return (
    <main className="min-h-full bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">製パンライン カンバン</h1>
            <p className="text-xs text-zinc-500">本日の製造バッチを工程ごとに見える化</p>
          </div>
          <span className="text-sm text-zinc-500">合計 {total} バッチ</span>
        </div>
      </header>
      <Board initial={columns} products={products} />
      <DbInspector snapshot={snapshot} />
    </main>
  );
}
