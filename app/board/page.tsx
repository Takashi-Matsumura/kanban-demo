import { getBoard, getProducts } from "@/lib/board";
import { Board } from "../_components/Board";
import { StageFlow } from "../_components/StageFlow";

export default async function BoardPage() {
  const [columns, products] = await Promise.all([getBoard(), getProducts()]);
  const total = columns.reduce((sum, col) => sum + col.cards.length, 0);
  const flowStages = columns.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    stageType: c.stageType,
    cardCount: c.cards.length,
  }));

  return (
    <main className="min-h-full">
      <div className="mx-auto max-w-7xl px-6 pt-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">工程詳細</h2>
            <p className="text-xs text-zinc-500">バッチをドラッグして工程間を移動・編集できます</p>
          </div>
          <span className="text-sm text-zinc-500">合計 {total} バッチ</span>
        </div>
        <div className="mt-4">
          <StageFlow stages={flowStages} clickable />
        </div>
      </div>
      <Board initial={columns} products={products} />
    </main>
  );
}
