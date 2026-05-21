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
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Column } from "./Column";
import { Card } from "./Card";
import { CardDetail } from "./CardDetail";
import type { BoardColumn, BoardEquipment, BoardProduct } from "@/lib/board";
import { moveCard } from "../actions";

type Props = {
  initial: BoardColumn[];
  products: BoardProduct[];
  equipments: BoardEquipment[];
};

const ORDER_STEP = 1024;

export function Board({ initial, products, equipments }: Props) {
  const [columns, setColumns] = useState<BoardColumn[]>(initial);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
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

  const allCards = useMemo(() => columns.flatMap((c) => c.cards), [columns]);
  const activeCard = activeCardId ? allCards.find((c) => c.id === activeCardId) : null;
  // open 中のカードが削除された場合、find が undefined を返すのでパネルは描画されない。
  // openCardId 自体は残るが副作用なし（cuid なので衝突しない）。
  const openCard = openCardId ? allCards.find((c) => c.id === openCardId) : null;

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <DndContext
        id="kanban-board"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex items-stretch gap-2 overflow-x-auto pb-4">
          {columns.map((column, i) => (
            <Fragment key={column.id}>
              <Column
                column={column}
                products={products}
                onOpenCard={setOpenCardId}
                index={i}
                total={columns.length}
              />
              {i < columns.length - 1 ? <FlowArrow /> : null}
            </Fragment>
          ))}
        </div>
        <DragOverlay>{activeCard ? <Card card={activeCard} dragging /> : null}</DragOverlay>
      </DndContext>
      {openCard ? (
        <CardDetail
          key={openCard.id}
          card={openCard}
          stageType={columns.find((c) => c.id === openCard.columnId)?.stageType ?? null}
          equipments={equipments}
          onClose={() => setOpenCardId(null)}
        />
      ) : null}
    </div>
  );
}

function FlowArrow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none flex shrink-0 items-center pt-10 text-zinc-300"
    >
      ▶
    </div>
  );
}

function signature(columns: BoardColumn[]) {
  return columns
    .map((col) =>
      [
        col.id,
        col.cards
          .map((c) => [c.id, c.order, c.columnId, c.title, c.description, c.updatedAt])
          .flat(),
      ].join(":")
    )
    .join("|");
}
