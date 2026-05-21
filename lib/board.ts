import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "./prisma";

export type BoardProduct = {
  id: string;
  name: string;
  sku: string;
  category: string;
};

export type BoardCard = {
  id: string;
  title: string;
  description: string | null;
  order: number;
  columnId: string;
  lotCode: string | null;
  product: BoardProduct | null;
  plannedQty: number | null;
  actualQty: number | null;
  batchDate: string | null;
  shift: string | null;
  assignee: string | null;
  priority: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BoardColumn = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  order: number;
  stageType: string | null;
  expectedMinutes: number | null;
  cards: BoardCard[];
};

export async function getBoard(): Promise<BoardColumn[]> {
  "use cache";
  cacheLife("max");
  cacheTag("board");

  const columns = await prisma.column.findMany({
    orderBy: { order: "asc" },
    include: {
      cards: {
        orderBy: { order: "asc" },
        include: { product: true },
      },
    },
  });

  return columns.map((column) => ({
    id: column.id,
    name: column.name,
    description: column.description,
    color: column.color,
    order: column.order,
    stageType: column.stageType,
    expectedMinutes: column.expectedMinutes,
    cards: column.cards.map((card) => ({
      id: card.id,
      title: card.title,
      description: card.description,
      order: card.order,
      columnId: card.columnId,
      lotCode: card.lotCode,
      product: card.product
        ? {
            id: card.product.id,
            name: card.product.name,
            sku: card.product.sku,
            category: card.product.category,
          }
        : null,
      plannedQty: card.plannedQty,
      actualQty: card.actualQty,
      batchDate: card.batchDate ? card.batchDate.toISOString() : null,
      shift: card.shift,
      assignee: card.assignee,
      priority: card.priority,
      note: card.note,
      createdAt: card.createdAt.toISOString(),
      updatedAt: card.updatedAt.toISOString(),
    })),
  }));
}

export async function getProducts(): Promise<BoardProduct[]> {
  "use cache";
  cacheLife("max");
  cacheTag("board");

  const products = await prisma.product.findMany({ orderBy: { name: "asc" } });
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    category: p.category,
  }));
}
