"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { BoardCard } from "@/lib/board";
import { deleteCard, editCardDescription, renameCard } from "../actions";

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

function formatDate(iso: string) {
  return dateFormatter.format(new Date(iso));
}

export function CardDetail({ card, onClose }: Props) {
  // 親が key={card.id} で渡しているため、別カードを開くたびにこのコンポーネントは
  // remount される。よって props からの初期化はマウント時の useState で十分。
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [, startTransition] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);

  // Esc で閉じる
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 開いた直後にタイトルへフォーカス（編集しやすく）
  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
  }, []);

  function commitTitle() {
    const trimmed = title.trim();
    if (!trimmed || trimmed === card.title) {
      setTitle(card.title);
      return;
    }
    startTransition(async () => {
      await renameCard(card.id, trimmed);
    });
  }

  function commitDescription() {
    const original = card.description ?? "";
    if (description === original) return;
    startTransition(async () => {
      await editCardDescription(card.id, description);
    });
  }

  function onDelete() {
    if (!confirm("このカードを削除しますか？")) return;
    startTransition(async () => {
      await deleteCard(card.id);
    });
    onClose();
  }

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/20"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-detail-title"
        className="fixed inset-y-0 right-0 z-50 flex w-[420px] max-w-full flex-col border-l border-zinc-200 bg-white shadow-xl"
      >
        <header className="flex items-start gap-2 border-b border-zinc-200 px-4 py-3">
          <input
            ref={titleRef}
            id="card-detail-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="flex-1 rounded border border-transparent px-2 py-1 text-base font-semibold text-zinc-900 hover:border-zinc-300 focus:border-blue-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <label htmlFor="card-detail-desc" className="block text-xs font-semibold text-zinc-600">
            説明
          </label>
          <textarea
            id="card-detail-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={commitDescription}
            placeholder="このカードの詳細を書く"
            rows={8}
            className="mt-1 w-full resize-y rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-800 focus:border-blue-500 focus:outline-none"
          />

          <dl className="mt-6 grid grid-cols-[6rem_1fr] gap-y-1 text-xs text-zinc-600">
            <dt className="font-medium">作成日時</dt>
            <dd>{formatDate(card.createdAt)}</dd>
            <dt className="font-medium">更新日時</dt>
            <dd>{formatDate(card.updatedAt)}</dd>
          </dl>
        </div>

        <footer className="border-t border-zinc-200 px-4 py-3">
          <button
            type="button"
            onClick={onDelete}
            className="rounded border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            このカードを削除
          </button>
        </footer>
      </aside>
    </>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
    </svg>
  );
}
