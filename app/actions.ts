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

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const card = await tx.card.create({
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
        currentStageEnteredAt: now,
      },
    });
    await tx.stageHistory.create({
      data: { cardId: card.id, columnId, enteredAt: now },
    });
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

export async function setEquipmentForCard(cardId: string, equipmentId: string | null) {
  await prisma.card.update({
    where: { id: cardId },
    data: { equipmentId: equipmentId ?? null },
  });
  updateTag("board");
}

export async function overrideTargetReadyAt(cardId: string, isoOrNull: string | null) {
  const value = isoOrNull && isoOrNull.trim() !== "" ? new Date(isoOrNull) : null;
  await prisma.card.update({
    where: { id: cardId },
    data: { targetReadyAt: value },
  });
  updateTag("board");
}

export async function addQualityCheck(args: {
  cardId: string;
  columnId: string;
  type: string;
  value?: string | null;
  passed: boolean;
  note?: string | null;
  byUser?: string | null;
}) {
  const value = args.value && args.value.trim() !== "" ? args.value.trim() : null;
  const note = args.note && args.note.trim() !== "" ? args.note.trim() : null;
  const byUser = args.byUser && args.byUser.trim() !== "" ? args.byUser.trim() : null;

  await prisma.qualityCheck.create({
    data: {
      cardId: args.cardId,
      columnId: args.columnId,
      type: args.type,
      value,
      passed: args.passed,
      note,
      byUser,
    },
  });
  updateTag("board");
}

export async function deleteQualityCheck(id: string) {
  await prisma.qualityCheck.delete({ where: { id } });
  updateTag("board");
}

export async function deleteCard(cardId: string) {
  await prisma.card.delete({ where: { id: cardId } });
  updateTag("board");
}

/**
 * Move a card to a new column at a specific position.
 * Same-column reorder: only updates order, history unchanged.
 * Cross-column move: closes previous history (leftAt + durationSec), opens new history, updates currentStageEnteredAt.
 * Done atomically in a transaction.
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

  await prisma.$transaction(async (tx) => {
    const card = await tx.card.findUnique({ where: { id: cardId }, select: { columnId: true } });
    if (!card) return;

    const stageChanged = card.columnId !== toColumnId;

    if (stageChanged) {
      const now = new Date();
      // 前工程の最新オープン履歴を閉じる
      const open = await tx.stageHistory.findFirst({
        where: { cardId, leftAt: null },
        orderBy: { enteredAt: "desc" },
      });
      if (open) {
        await tx.stageHistory.update({
          where: { id: open.id },
          data: {
            leftAt: now,
            durationSec: Math.max(0, Math.floor((now.getTime() - open.enteredAt.getTime()) / 1000)),
          },
        });
      }
      // 新工程の履歴を開く
      await tx.stageHistory.create({
        data: { cardId, columnId: toColumnId, enteredAt: now },
      });
      await tx.card.update({
        where: { id: cardId },
        data: { columnId: toColumnId, order: newOrder, currentStageEnteredAt: now },
      });
    } else {
      await tx.card.update({
        where: { id: cardId },
        data: { order: newOrder },
      });
    }
  });

  updateTag("board");
}

export async function voiceMoveCard(cardId: string, toColumnId: string) {
  const last = await prisma.card.findFirst({
    where: { columnId: toColumnId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const orderBefore = last?.order ?? null;
  return moveCard({ cardId, toColumnId, orderBefore, orderAfter: null });
}
