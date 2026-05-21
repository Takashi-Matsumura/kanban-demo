"use client";

import { useState, useTransition } from "react";
import type { BoardProduct } from "@/lib/board";
import { createBatch } from "../actions";

type Props = {
  columnId: string;
  products: BoardProduct[];
};

export function AddCardForm({ columnId, products }: Props) {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [shift, setShift] = useState("morning");
  const [, startTransition] = useTransition();

  function submit() {
    if (!productId) return;
    startTransition(async () => {
      await createBatch({ columnId, productId, shift });
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1 rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-700"
      >
        <span aria-hidden>＋</span> バッチを追加
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-2"
    >
      <label className="text-[11px] font-semibold text-zinc-600">製品</label>
      <select
        value={productId}
        onChange={(e) => setProductId(e.target.value)}
        className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
      >
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}（{p.category}）
          </option>
        ))}
      </select>

      <label className="text-[11px] font-semibold text-zinc-600">シフト</label>
      <select
        value={shift}
        onChange={(e) => setShift(e.target.value)}
        className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
      >
        <option value="morning">朝便</option>
        <option value="noon">昼便</option>
        <option value="evening">夕便</option>
      </select>

      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1 text-xs text-white hover:bg-zinc-800"
        >
          追加
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-200/60"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
