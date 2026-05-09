"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Column } from "./Column";
import { Card } from "./Card";
import type { BoardColumn } from "@/lib/board";
import { moveCard } from "../actions";

type Props = {
  initial: BoardColumn[];
};

const ORDER_STEP = 1024;

export function Board({ initial }: Props) {
  const [columns, setColumns] = useState<BoardColumn[]>(initial);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // initial が変わった（= Server Action 後に revalidate された）ら state を同期。
  const prevSigRef = useRef("");
  useEffect(() => {
    const sig = signature(initial);
    if (sig === prevSigRef.current) return;
    prevSigRef.current = sig;
    setColumns(initial);
  }, [initial]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const cardIndex = useMemo(() => {
    const map = new Map<string, { columnId: string; index: number }>();
    columns.forEach((col) => {
      col.cards.forEach((card, index) => {
        map.set(card.id, { columnId: col.id, index });
      });
    });
    return map;
  }, [columns]);

  function handleDragStart(event: DragStartEvent) {
    setActiveCardId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCardId(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const from = cardIndex.get(activeId);
    if (!from) return;

    const overInfo = cardIndex.get(overId);
    const toColumnId = overInfo ? overInfo.columnId : overId;

    const next = columns.map((col) => ({ ...col, cards: [...col.cards] }));
    const fromCol = next.find((c) => c.id === from.columnId);
    const toCol = next.find((c) => c.id === toColumnId);
    if (!fromCol || !toCol) return;

    const [moved] = fromCol.cards.splice(from.index, 1);

    let insertAt: number;
    if (overInfo) {
      // splice 後の index を計算: 同列・同方向(後ろ→前)はそのまま、同列で前→後は -1
      const sameCol = from.columnId === toColumnId;
      insertAt = sameCol && from.index < overInfo.index ? overInfo.index - 1 : overInfo.index;
      insertAt = Math.max(0, Math.min(toCol.cards.length, insertAt));
    } else {
      insertAt = toCol.cards.length;
    }

    toCol.cards.splice(insertAt, 0, { ...moved, columnId: toColumnId });

    const before = toCol.cards[insertAt - 1]?.order ?? null;
    const after = toCol.cards[insertAt + 1]?.order ?? null;
    let newOrder: number;
    if (before != null && after != null) newOrder = (before + after) / 2;
    else if (before != null) newOrder = before + ORDER_STEP;
    else if (after != null) newOrder = after - ORDER_STEP;
    else newOrder = ORDER_STEP;
    toCol.cards[insertAt] = { ...toCol.cards[insertAt], order: newOrder };

    setColumns(next);

    startTransition(async () => {
      try {
        await moveCard({
          cardId: activeId,
          toColumnId,
          orderBefore: before,
          orderAfter: after,
        });
      } catch {
        setColumns(initial);
      }
    });
  }

  const activeCard = activeCardId
    ? columns.flatMap((c) => c.cards).find((c) => c.id === activeCardId)
    : null;

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((column) => (
            <Column key={column.id} column={column} />
          ))}
        </div>
        <DragOverlay>{activeCard ? <Card card={activeCard} dragging /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function signature(columns: BoardColumn[]) {
  return columns
    .map((col) =>
      [
        col.id,
        col.cards.map((c) => [c.id, c.order, c.columnId, c.title, c.description]).flat(),
      ].join(":")
    )
    .join("|");
}
