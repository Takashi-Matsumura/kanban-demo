import type { CardRow, ColumnRow, DbSnapshot } from "@/lib/db-snapshot";

type Props = {
  snapshot: DbSnapshot;
};

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function formatDate(iso: string) {
  return dateFormatter.format(new Date(iso));
}

export function DbInspector({ snapshot }: Props) {
  return (
    <section className="mt-8 border-t border-zinc-200 bg-white">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <header className="mb-4">
          <h2 className="text-base font-semibold text-zinc-900">データベース (SQLite)</h2>
          <p className="mt-1 text-xs text-zinc-500">
            画面上のカンバンが、実際にどのようなテーブル・行として SQLite に保存されているかをリアルタイムで表示します。
            上部でカードの追加・編集・移動を行うと、下のテーブルも更新されます。
          </p>
        </header>

        <div className="space-y-6">
          <ColumnTable rows={snapshot.columns} />
          <CardTable rows={snapshot.cards} />
        </div>
      </div>
    </section>
  );
}

function ColumnTable({ rows }: { rows: ColumnRow[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-zinc-800">
        Column テーブル <span className="text-zinc-500">({rows.length} 行)</span>
      </h3>
      <p className="mb-2 text-xs text-zinc-500">列（Todo / In Progress / Done）の定義を保持。</p>
      <div className="overflow-x-auto rounded border border-zinc-200">
        <table className="min-w-full text-xs">
          <thead className="bg-zinc-50 text-left text-zinc-600">
            <tr>
              <Th>id</Th>
              <Th>name</Th>
              <Th>description</Th>
              <Th>color</Th>
              <Th>order</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-zinc-200">
                <Td mono>{row.id}</Td>
                <Td>{row.name}</Td>
                <Td>{nullable(row.description)}</Td>
                <Td>{row.color}</Td>
                <Td mono>{row.order}</Td>
              </tr>
            ))}
            {rows.length === 0 ? <EmptyRow colSpan={5} /> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CardTable({ rows }: { rows: CardRow[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-zinc-800">
        Card テーブル <span className="text-zinc-500">({rows.length} 行)</span>
      </h3>
      <p className="mb-2 text-xs text-zinc-500">
        カード本体。<code className="rounded bg-zinc-100 px-1 py-0.5">columnId</code> が
        Column テーブルの <code className="rounded bg-zinc-100 px-1 py-0.5">id</code>{" "}
        を参照（外部キー）。
      </p>
      <div className="overflow-x-auto rounded border border-zinc-200">
        <table className="min-w-full text-xs">
          <thead className="bg-zinc-50 text-left text-zinc-600">
            <tr>
              <Th>id</Th>
              <Th>title</Th>
              <Th>description</Th>
              <Th>order</Th>
              <Th>columnId</Th>
              <Th>createdAt</Th>
              <Th>updatedAt</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-zinc-200">
                <Td mono>{row.id}</Td>
                <Td>{row.title}</Td>
                <Td>{nullable(row.description)}</Td>
                <Td mono>{row.order}</Td>
                <Td mono>{row.columnId}</Td>
                <Td mono>{formatDate(row.createdAt)}</Td>
                <Td mono>{formatDate(row.updatedAt)}</Td>
              </tr>
            ))}
            {rows.length === 0 ? <EmptyRow colSpan={7} /> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-2 font-medium">{children}</th>;
}

function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td className={`whitespace-nowrap px-3 py-2 ${mono ? "font-mono text-zinc-700" : "text-zinc-800"}`}>
      {children}
    </td>
  );
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-4 text-center text-zinc-400">
        行がありません
      </td>
    </tr>
  );
}

function nullable(value: string | null) {
  if (value === null) return <span className="text-zinc-400">NULL</span>;
  if (value === "") return <span className="text-zinc-400">&quot;&quot;</span>;
  return value;
}
