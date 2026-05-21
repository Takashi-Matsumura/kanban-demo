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

const SHIFT_LABEL: Record<string, string> = {
  morning: "朝",
  noon: "昼",
  evening: "夕",
};

const PRIORITY_STYLE: Record<string, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  normal: "bg-zinc-100 text-zinc-600 border-zinc-200",
  low: "bg-zinc-50 text-zinc-500 border-zinc-200",
};

const PRIORITY_LABEL: Record<string, string> = {
  high: "高",
  normal: "通常",
  low: "低",
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
    if (!confirm("このバッチを削除しますか？")) return;
    startTransition(async () => {
      await deleteCard(card.id);
    });
  }

  const openable = !dragging && onOpen;
  const productName = card.product?.name ?? card.title;
  const shiftLabel = card.shift ? SHIFT_LABEL[card.shift] : null;
  const priority = card.priority ?? "normal";
  const priorityStyle = PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.normal;
  const priorityLabel = PRIORITY_LABEL[priority] ?? priority;

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
          {card.lotCode ? (
            <p className="font-mono text-[11px] leading-tight text-zinc-500">{card.lotCode}</p>
          ) : null}
          <p className="text-sm font-medium text-zinc-900">
            {productName}
            {shiftLabel ? <span className="ml-1 text-xs text-zinc-500">{shiftLabel}便</span> : null}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {card.plannedQty != null ? (
              <span className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-zinc-700">
                {card.actualQty != null ? `${card.actualQty}/${card.plannedQty}` : card.plannedQty} 個
              </span>
            ) : null}
            {card.assignee ? (
              <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-blue-700">
                担当: {card.assignee}
              </span>
            ) : null}
            <span className={`rounded border px-1.5 py-0.5 ${priorityStyle}`}>
              {priorityLabel}
            </span>
          </div>

          {card.note ? (
            <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{card.note}</p>
          ) : card.description ? (
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
