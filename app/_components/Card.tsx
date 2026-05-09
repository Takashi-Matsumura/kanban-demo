"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTransition } from "react";
import type { BoardCard } from "@/lib/board";
import { deleteCard } from "../actions";

type Props = {
  card: BoardCard;
  dragging?: boolean;
  onOpen?: (cardId: string) => void;
};

export function Card({ card, dragging, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });
  const [, startTransition] = useTransition();

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  function onDelete() {
    if (!confirm("このカードを削除しますか？")) return;
    startTransition(async () => {
      await deleteCard(card.id);
    });
  }

  const openable = !dragging && onOpen;

  return (
    <article
      ref={dragging ? undefined : setNodeRef}
      style={dragging ? undefined : style}
      onClick={openable ? () => onOpen!(card.id) : undefined}
      className={`group rounded-md border border-zinc-200 bg-white px-3 py-2 shadow-sm ${
        dragging ? "shadow-lg" : "cursor-pointer hover:border-zinc-300"
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label="ドラッグハンドル"
          onClick={(e) => e.stopPropagation()}
          className="mt-1 cursor-grab text-zinc-300 hover:text-zinc-500 active:cursor-grabbing"
          {...(dragging ? {} : attributes)}
          {...(dragging ? {} : listeners)}
        >
          <DragHandleIcon />
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-900">{card.title}</p>
          {card.description ? (
            <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{card.description}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
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
