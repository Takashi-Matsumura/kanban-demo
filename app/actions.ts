"use server";

import { updateTag } from "next/cache";
import { prisma } from "@/lib/prisma";

const ORDER_STEP = 1024;

export async function createCard(columnId: string, title: string) {
  const trimmed = title.trim();
  if (!trimmed) return;

  const last = await prisma.card.findFirst({
    where: { columnId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const nextOrder = (last?.order ?? 0) + ORDER_STEP;

  await prisma.card.create({
    data: { columnId, title: trimmed, order: nextOrder },
  });
  updateTag("board");
}

export async function renameCard(cardId: string, title: string) {
  const trimmed = title.trim();
  if (!trimmed) return;
  await prisma.card.update({ where: { id: cardId }, data: { title: trimmed } });
  updateTag("board");
}

export async function editCardDescription(cardId: string, description: string) {
  const value = description.trim() === "" ? null : description;
  await prisma.card.update({ where: { id: cardId }, data: { description: value } });
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
