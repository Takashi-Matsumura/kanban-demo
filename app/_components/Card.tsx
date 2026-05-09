"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, useTransition } from "react";
import type { BoardCard } from "@/lib/board";
import { deleteCard, renameCard } from "../actions";

type Props = {
  card: BoardCard;
  dragging?: boolean;
};

export function Card({ card, dragging }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.title);
  const [, startTransition] = useTransition();

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  function commit() {
    setEditing(false);
    if (draft.trim() === "" || draft === card.title) {
      setDraft(card.title);
      return;
    }
    startTransition(async () => {
      await renameCard(card.id, draft);
    });
  }

  function onDelete() {
    if (!confirm("このカードを削除しますか？")) return;
    startTransition(async () => {
      await deleteCard(card.id);
    });
  }

  return (
    <article
      ref={dragging ? undefined : setNodeRef}
      style={dragging ? undefined : style}
      className={`group rounded-md border border-zinc-200 bg-white px-3 py-2 shadow-sm ${
        dragging ? "shadow-lg" : "hover:border-zinc-300"
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label="ドラッグハンドル"
          className="mt-1 cursor-grab text-zinc-300 hover:text-zinc-500 active:cursor-grabbing"
          {...(dragging ? {} : attributes)}
          {...(dragging ? {} : listeners)}
        >
          <DragHandleIcon />
        </button>

        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
                if (e.key === "Escape") {
                  setDraft(card.title);
                  setEditing(false);
                }
              }}
              className="w-full rounded border border-zinc-300 px-1 py-0.5 text-sm focus:border-blue-500 focus:outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="block w-full text-left text-sm text-zinc-900 hover:text-blue-700"
            >
              {card.title}
            </button>
          )}
          {card.description ? (
            <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{card.description}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onDelete}
          aria-label="削除"
          className="text-zinc-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
        >
          <TrashIcon />
        </button>
      </div>
    </article>
  );
}

function DragHandleIcon() {
  return (
    <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor" aria-hidden>
      <circle cx="3" cy="3" r="1.2" />
      <circle cx="9" cy="3" r="1.2" />
      <circle cx="3" cy="7" r="1.2" />
      <circle cx="9" cy="7" r="1.2" />
      <circle cx="3" cy="11" r="1.2" />
      <circle cx="9" cy="11" r="1.2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M2.5 4h9M5.5 4V2.5h3V4M3.5 4l.5 8h6l.5-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
