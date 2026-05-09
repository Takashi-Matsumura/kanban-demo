import { getBoard } from "@/lib/board";
import { getDbSnapshot } from "@/lib/db-snapshot";
import { Board } from "./_components/Board";
import { DbInspector } from "./_components/DbInspector";

export default async function Home() {
  const [columns, snapshot] = await Promise.all([getBoard(), getDbSnapshot()]);
  const total = columns.reduce((sum, col) => sum + col.cards.length, 0);

  return (
    <main className="min-h-full bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold text-zinc-900">カンバン</h1>
          <span className="text-sm text-zinc-500">合計 {total} 件</span>
        </div>
      </header>
      <Board initial={columns} />
      <DbInspector snapshot={snapshot} />
    </main>
  );
}
