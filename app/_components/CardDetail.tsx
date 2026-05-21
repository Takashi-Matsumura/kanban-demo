"use client";

import { useEffect, useState, useTransition } from "react";
import type { BoardCard } from "@/lib/board";
import { deleteCard, updateBatchMeta } from "../actions";

type Props = {
  card: BoardCard;
  onClose: () => void;
};

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateTime(iso: string) {
  return dateFormatter.format(new Date(iso));
}

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function CardDetail({ card, onClose }: Props) {
  const [plannedQty, setPlannedQty] = useState(card.plannedQty?.toString() ?? "");
  const [actualQty, setActualQty] = useState(card.actualQty?.toString() ?? "");
  const [assignee, setAssignee] = useState(card.assignee ?? "");
  const [priority, setPriority] = useState(card.priority ?? "normal");
  const [shift, setShift] = useState(card.shift ?? "");
  const [batchDate, setBatchDate] = useState(toDateInput(card.batchDate));
  const [note, setNote] = useState(card.note ?? "");
  const [description, setDescription] = useState(card.description ?? "");
  const [, startTransition] = useTransition();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function commit(patch: Parameters<typeof updateBatchMeta>[1]) {
    startTransition(async () => {
      await updateBatchMeta(card.id, patch);
    });
  }

  function commitPlannedQty() {
    const original = card.plannedQty?.toString() ?? "";
    if (plannedQty === original) return;
    const n = plannedQty.trim() === "" ? null : Number(plannedQty);
    if (n !== null && (!Number.isFinite(n) || n < 0)) {
      setPlannedQty(original);
      return;
    }
    commit({ plannedQty: n });
  }

  function commitActualQty() {
    const original = card.actualQty?.toString() ?? "";
    if (actualQty === original) return;
    const n = actualQty.trim() === "" ? null : Number(actualQty);
    if (n !== null && (!Number.isFinite(n) || n < 0)) {
      setActualQty(original);
      return;
    }
    commit({ actualQty: n });
  }

  function commitAssignee() {
    if (assignee === (card.assignee ?? "")) return;
    commit({ assignee });
  }

  function commitNote() {
    if (note === (card.note ?? "")) return;
    commit({ note });
  }

  function commitDescription() {
    if (description === (card.description ?? "")) return;
    commit({ description });
  }

  function onDelete() {
    if (!confirm("このバッチを削除しますか？")) return;
    startTransition(async () => {
      await deleteCard(card.id);
    });
    onClose();
  }

  return (
    <>
      <div aria-hidden onClick={onClose} className="fixed inset-0 z-40 bg-black/20" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-detail-title"
        className="fixed inset-y-0 right-0 z-50 flex w-[440px] max-w-full flex-col border-l border-zinc-200 bg-white shadow-xl"
      >
        <header className="border-b border-zinc-200 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {card.lotCode ? (
                <p className="font-mono text-[11px] text-zinc-500">{card.lotCode}</p>
              ) : null}
              <h2 id="card-detail-title" className="truncate text-base font-semibold text-zinc-900">
                {card.product?.name ?? card.title}
              </h2>
              {card.product ? (
                <p className="mt-0.5 text-xs text-zinc-500">
                  {card.product.category}・SKU {card.product.sku}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <FieldRow>
            <Field label="計画数量">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={plannedQty}
                onChange={(e) => setPlannedQty(e.target.value)}
                onBlur={commitPlannedQty}
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
              />
            </Field>
            <Field label="実績数量">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={actualQty}
                onChange={(e) => setActualQty(e.target.value)}
                onBlur={commitActualQty}
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
              />
            </Field>
          </FieldRow>

          <FieldRow>
            <Field label="担当者">
              <input
                type="text"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                onBlur={commitAssignee}
                placeholder="例: 田中"
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
              />
            </Field>
            <Field label="優先度">
              <select
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value);
                  commit({ priority: e.target.value });
                }}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="low">低</option>
                <option value="normal">通常</option>
                <option value="high">高</option>
              </select>
            </Field>
          </FieldRow>

          <FieldRow>
            <Field label="シフト">
              <select
                value={shift}
                onChange={(e) => {
                  setShift(e.target.value);
                  commit({ shift: e.target.value === "" ? null : e.target.value });
                }}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">（未設定）</option>
                <option value="morning">朝</option>
                <option value="noon">昼</option>
                <option value="evening">夕</option>
              </select>
            </Field>
            <Field label="バッチ日付">
              <input
                type="date"
                value={batchDate}
                onChange={(e) => {
                  setBatchDate(e.target.value);
                  commit({ batchDate: e.target.value === "" ? null : e.target.value });
                }}
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
              />
            </Field>
          </FieldRow>

          <div className="mt-4">
            <label className="block text-xs font-semibold text-zinc-600">現場メモ・特記事項</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={commitNote}
              rows={3}
              placeholder="例: 新人ペア作業のためフォロー要"
              className="mt-1 w-full resize-y rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-800 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="mt-4">
            <label className="block text-xs font-semibold text-zinc-600">説明（任意）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={commitDescription}
              rows={3}
              className="mt-1 w-full resize-y rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-800 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <dl className="mt-6 grid grid-cols-[6rem_1fr] gap-y-1 text-xs text-zinc-600">
            <dt className="font-medium">作成日時</dt>
            <dd>{formatDateTime(card.createdAt)}</dd>
            <dt className="font-medium">更新日時</dt>
            <dd>{formatDateTime(card.updatedAt)}</dd>
          </dl>
        </div>

        <footer className="border-t border-zinc-200 px-4 py-3">
          <button
            type="button"
            onClick={onDelete}
            className="rounded border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            このバッチを削除
          </button>
        </footer>
      </aside>
    </>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 grid grid-cols-2 gap-3">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-600">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
    </svg>
  );
}
