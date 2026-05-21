"use server";

import { updateTag } from "next/cache";
import { prisma } from "@/lib/prisma";

const ORDER_STEP = 1024;

const SHIFT_LABEL: Record<string, string> = {
  morning: "朝",
  noon: "昼",
  evening: "夕",
};

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function createBatch(args: {
  columnId: string;
  productId: string;
  shift?: string;
  batchDate?: string;
  plannedQty?: number;
}) {
  const { columnId, productId } = args;
  const shift = args.shift && SHIFT_LABEL[args.shift] ? args.shift : "morning";

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return;

  const batchDate = args.batchDate ? startOfDay(new Date(args.batchDate)) : startOfDay(new Date());
  const plannedQty = args.plannedQty ?? product.defaultPlannedQty ?? null;

  const sameCount = await prisma.card.count({
    where: { productId, shift, batchDate },
  });
  const seq = sameCount + 1;
  const lotCode = `${formatDate(batchDate)}-${SHIFT_LABEL[shift]}-${product.name}${String(seq).padStart(2, "0")}`;

  const last = await prisma.card.findFirst({
    where: { columnId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const nextOrder = (last?.order ?? 0) + ORDER_STEP;

  await prisma.card.create({
    data: {
      columnId,
      order: nextOrder,
      title: `${product.name} ${SHIFT_LABEL[shift]}便`,
      lotCode,
      productId,
      shift,
      batchDate,
      plannedQty,
      priority: "normal",
    },
  });
  updateTag("board");
}

export async function updateBatchMeta(
  cardId: string,
  patch: {
    plannedQty?: number | null;
    actualQty?: number | null;
    assignee?: string | null;
    priority?: string;
    shift?: string | null;
    batchDate?: string | null;
    note?: string | null;
    description?: string | null;
  },
) {
  const data: Record<string, unknown> = {};

  if ("plannedQty" in patch) data.plannedQty = patch.plannedQty;
  if ("actualQty" in patch) data.actualQty = patch.actualQty;
  if ("assignee" in patch) {
    const v = (patch.assignee ?? "").trim();
    data.assignee = v === "" ? null : v;
  }
  if ("priority" in patch && patch.priority) {
    data.priority = patch.priority;
  }
  if ("shift" in patch) {
    data.shift = patch.shift && SHIFT_LABEL[patch.shift] ? patch.shift : null;
  }
  if ("batchDate" in patch) {
    data.batchDate = patch.batchDate ? startOfDay(new Date(patch.batchDate)) : null;
  }
  if ("note" in patch) {
    const v = (patch.note ?? "").trim();
    data.note = v === "" ? null : v;
  }
  if ("description" in patch) {
    const v = (patch.description ?? "").trim();
    data.description = v === "" ? null : v;
  }

  if (Object.keys(data).length === 0) return;

  await prisma.card.update({ where: { id: cardId }, data });
  updateTag("board");
}

export async function deleteCard(cardId: string) {
  await prisma.card.delete({ where: { id: cardId } });
  updateTag("board");
}

/**
 * Move a card to a new column at a specific position.
 * The caller passes the orderBefore / orderAfter values of the neighbors in the target column.
 * If both are omitted -> append (last + STEP). Only orderAfter -> insert at top (first - STEP).
 * Only orderBefore -> after that card.
 * Both -> midpoint.
 */
export async function moveCard(args: {
  cardId: string;
  toColumnId: string;
  orderBefore?: number | null;
  orderAfter?: number | null;
}) {
  const { cardId, toColumnId, orderBefore, orderAfter } = args;

  let newOrder: number;
  if (orderBefore != null && orderAfter != null) {
    newOrder = (orderBefore + orderAfter) / 2;
  } else if (orderBefore != null) {
    newOrder = orderBefore + ORDER_STEP;
  } else if (orderAfter != null) {
    newOrder = orderAfter - ORDER_STEP;
  } else {
    newOrder = ORDER_STEP;
  }

  await prisma.card.update({
    where: { id: cardId },
    data: { columnId: toColumnId, order: newOrder },
  });
  updateTag("board");
}
