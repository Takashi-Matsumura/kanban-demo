"use client";

import { useEffect, useState } from "react";
import type { CardRow, ColumnRow, DbSnapshot, ProductRow } from "@/lib/db-snapshot";

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

const dateOnlyFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatDate(iso: string) {
  return dateFormatter.format(new Date(iso));
}

function formatDateOnly(iso: string) {
  return dateOnlyFormatter.format(new Date(iso));
}

function cardSig(card: CardRow) {
  return [
    card.title,
    card.description ?? "",
    card.order,
    card.columnId,
    card.lotCode ?? "",
    card.productId ?? "",
    card.plannedQty ?? "",
    card.actualQty ?? "",
    card.batchDate ?? "",
    card.shift ?? "",
    card.assignee ?? "",
    card.priority,
    card.note ?? "",
    card.updatedAt,
  ].join("|");
}

function columnSig(col: ColumnRow) {
  return [col.name, col.description ?? "", col.color, col.order, col.stageType ?? "", col.expectedMinutes ?? ""].join("|");
}

function productSig(p: ProductRow) {
  return [p.name, p.sku, p.category, p.defaultPlannedQty ?? ""].join("|");
}

function diffHighlights(prev: DbSnapshot, next: DbSnapshot): Set<string> {
  const out = new Set<string>();
  const prevCards = new Map(prev.cards.map((c) => [c.id, cardSig(c)]));
  for (const c of next.cards) {
    if (prevCards.get(c.id) !== cardSig(c)) out.add(`card:${c.id}`);
  }
  const prevCols = new Map(prev.columns.map((c) => [c.id, columnSig(c)]));
  for (const c of next.columns) {
    if (prevCols.get(c.id) !== columnSig(c)) out.add(`col:${c.id}`);
  }
  const prevProducts = new Map(prev.products.map((p) => [p.id, productSig(p)]));
  for (const p of next.products) {
    if (prevProducts.get(p.id) !== productSig(p)) out.add(`product:${p.id}`);
  }
  return out;
}

export function DbInspector({ snapshot }: Props) {
  const [highlights, setHighlights] = useState<Set<string>>(new Set());
  const [prevSnapshot, setPrevSnapshot] = useState(snapshot);

  if (prevSnapshot !== snapshot) {
    const diff = diffHighlights(prevSnapshot, snapshot);
    setPrevSnapshot(snapshot);
    if (diff.size > 0) setHighlights(diff);
  }

  useEffect(() => {
    if (highlights.size === 0) return;
    const t = setTimeout(() => setHighlights(new Set()), 2000);
    return () => clearTimeout(t);
  }, [highlights]);

  return (
    <section className="mt-8 border-t border-zinc-200 bg-white">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <header className="mb-4">
          <h2 className="text-base font-semibold text-zinc-900">データベース (SQLite)</h2>
          <p className="mt-1 text-xs text-zinc-500">
            画面上のカンバンが、実際にどのようなテーブル・行として SQLite に保存されているかをリアルタイムで表示します。
            上部でバッチの追加・編集・移動を行うと、下のテーブルも更新され、変更行が一瞬黄色く光ります。
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ColumnTable rows={snapshot.columns} highlights={highlights} />
          <ProductTable rows={snapshot.products} highlights={highlights} />
        </div>
        <div className="mt-6">
          <CardTable rows={snapshot.cards} highlights={highlights} />
        </div>
      </div>
    </section>
  );
}

type TableProps<T> = {
  rows: T[];
  highlights: Set<string>;
};

function ColumnTable({ rows, highlights }: TableProps<ColumnRow>) {
  return (
    <div className="min-w-0">
      <h3 className="mb-2 text-sm font-semibold text-zinc-800">
        Column テーブル <span className="text-zinc-500">({rows.length} 行)</span>
      </h3>
      <p className="mb-2 text-xs text-zinc-500">製造ラインの工程定義。stageType と expectedMinutes（標準滞留分）を保持。</p>
      <div className="overflow-x-auto rounded border border-zinc-200">
        <table className="min-w-full text-xs">
          <thead className="bg-zinc-50 text-left text-zinc-600">
            <tr>
              <Th>id</Th>
              <Th>name</Th>
              <Th>stageType</Th>
              <Th>color</Th>
              <Th>order</Th>
              <Th>expectedMin</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-t border-zinc-200 transition-colors duration-700 ${
                  highlights.has(`col:${row.id}`) ? "bg-yellow-100" : ""
                }`}
              >
                <Td mono>{row.id}</Td>
                <Td>{row.name}</Td>
                <Td mono>{nullable(row.stageType)}</Td>
                <Td>{row.color}</Td>
                <Td mono>{row.order}</Td>
                <Td mono>{row.expectedMinutes ?? <span className="text-zinc-400">NULL</span>}</Td>
              </tr>
            ))}
            {rows.length === 0 ? <EmptyRow colSpan={6} /> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductTable({ rows, highlights }: TableProps<ProductRow>) {
  return (
    <div className="min-w-0">
      <h3 className="mb-2 text-sm font-semibold text-zinc-800">
        Product テーブル <span className="text-zinc-500">({rows.length} 行)</span>
      </h3>
      <p className="mb-2 text-xs text-zinc-500">製品マスタ。バッチ（Card）が外部キーで参照する。</p>
      <div className="overflow-x-auto rounded border border-zinc-200">
        <table className="min-w-full text-xs">
          <thead className="bg-zinc-50 text-left text-zinc-600">
            <tr>
              <Th>id</Th>
              <Th>name</Th>
              <Th>sku</Th>
              <Th>category</Th>
              <Th>defaultQty</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-t border-zinc-200 transition-colors duration-700 ${
                  highlights.has(`product:${row.id}`) ? "bg-yellow-100" : ""
                }`}
              >
                <Td mono>{row.id}</Td>
                <Td>{row.name}</Td>
                <Td mono>{row.sku}</Td>
                <Td>{row.category}</Td>
                <Td mono>{row.defaultPlannedQty ?? <span className="text-zinc-400">NULL</span>}</Td>
              </tr>
            ))}
            {rows.length === 0 ? <EmptyRow colSpan={5} /> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CardTable({ rows, highlights }: TableProps<CardRow>) {
  return (
    <div className="min-w-0">
      <h3 className="mb-2 text-sm font-semibold text-zinc-800">
        Card テーブル <span className="text-zinc-500">({rows.length} 行)</span>
      </h3>
      <p className="mb-2 text-xs text-zinc-500">
        製造バッチ本体。<code className="rounded bg-zinc-100 px-1 py-0.5">columnId</code> は工程を、
        <code className="ml-1 rounded bg-zinc-100 px-1 py-0.5">productId</code> は製品を参照。
      </p>
      <div className="overflow-x-auto rounded border border-zinc-200">
        <table className="min-w-full text-xs">
          <thead className="bg-zinc-50 text-left text-zinc-600">
            <tr>
              <Th>lotCode</Th>
              <Th>productId</Th>
              <Th>columnId</Th>
              <Th>shift</Th>
              <Th>batchDate</Th>
              <Th>planned</Th>
              <Th>actual</Th>
              <Th>assignee</Th>
              <Th>priority</Th>
              <Th>order</Th>
              <Th>updatedAt</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-t border-zinc-200 transition-colors duration-700 ${
                  highlights.has(`card:${row.id}`) ? "bg-yellow-100" : ""
                }`}
              >
                <Td mono>{nullable(row.lotCode)}</Td>
                <Td mono>{nullable(row.productId)}</Td>
                <Td mono>{row.columnId}</Td>
                <Td>{nullable(row.shift)}</Td>
                <Td mono>{row.batchDate ? formatDateOnly(row.batchDate) : <span className="text-zinc-400">NULL</span>}</Td>
                <Td mono>{row.plannedQty ?? <span className="text-zinc-400">NULL</span>}</Td>
                <Td mono>{row.actualQty ?? <span className="text-zinc-400">NULL</span>}</Td>
                <Td>{nullable(row.assignee)}</Td>
                <Td>{row.priority}</Td>
                <Td mono>{row.order}</Td>
                <Td mono>{formatDate(row.updatedAt)}</Td>
              </tr>
            ))}
            {rows.length === 0 ? <EmptyRow colSpan={11} /> : null}
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
