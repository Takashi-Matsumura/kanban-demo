"use client";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { Card } from "./Card";
import { AddCardForm } from "./AddCardForm";
import type { BoardColumn } from "@/lib/board";

type Props = {
  column: BoardColumn;
  onOpenCard?: (cardId: string) => void;
};

const COLOR_DOT: Record<string, string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  purple: "bg-purple-500",
};

export function Column({ column, onOpenCard }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const cardIds = column.cards.map((c) => c.id);
  const dotClass = COLOR_DOT[column.color] ?? "bg-zinc-400";

  return (
    <section
      ref={setNodeRef}
      className={`flex w-80 shrink-0 flex-col rounded-lg border bg-zinc-100/60 ${
        isOver ? "border-blue-400" : "border-zinc-200"
      }`}
    >
      <header className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${dotClass}`} />
          <h2 className="text-sm font-semibold text-zinc-800">{column.name}</h2>
          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">
            {column.cards.length}
          </span>
        </div>
      </header>
      {column.description ? (
        <p className="px-3 pb-2 text-xs text-zinc-500">{column.description}</p>
      ) : null}

      <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {column.cards.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-zinc-400">項目がありません</p>
          ) : (
            column.cards.map((card) => (
              <Card key={card.id} card={card} onOpen={onOpenCard} />
            ))
          )}
        </SortableContext>
      </div>

      <div className="border-t border-zinc-200 p-2">
        <AddCardForm columnId={column.id} />
      </div>
    </section>
  );
}
