import { getDbSnapshot } from "@/lib/db-snapshot";
import { DbInspector } from "../_components/DbInspector";

export default async function DbPage() {
  const snapshot = await getDbSnapshot();

  return (
    <main className="min-h-full">
      <div className="mx-auto max-w-7xl px-6 pt-6">
        <h2 className="text-lg font-semibold text-zinc-900">データベース</h2>
        <p className="text-xs text-zinc-500">
          画面上の操作が SQLite にどのように保存されているかを確認するデモ用ビューです
        </p>
      </div>
      <DbInspector snapshot={snapshot} />
    </main>
  );
}
