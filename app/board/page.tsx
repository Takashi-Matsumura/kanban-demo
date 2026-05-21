import { getBoard, getProducts } from "@/lib/board";
import { Board } from "../_components/Board";

export default async function BoardPage() {
  const [columns, products] = await Promise.all([getBoard(), getProducts()]);
  const total = columns.reduce((sum, col) => sum + col.cards.length, 0);

  return (
    <main className="min-h-full">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 pt-6">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">工程詳細</h2>
          <p className="text-xs text-zinc-500">バッチをドラッグして工程間を移動・編集できます</p>
        </div>
        <span className="text-sm text-zinc-500">合計 {total} バッチ</span>
      </div>
      <Board initial={columns} products={products} />
    </main>
  );
}
