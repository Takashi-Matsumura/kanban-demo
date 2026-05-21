import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "./prisma";

export type ColumnRow = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  order: number;
  stageType: string | null;
  expectedMinutes: number | null;
};

export type ProductRow = {
  id: string;
  name: string;
  sku: string;
  category: string;
  defaultPlannedQty: number | null;
};

export type CardRow = {
  id: string;
  title: string;
  description: string | null;
  order: number;
  columnId: string;
  lotCode: string | null;
  productId: string | null;
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

export type DbSnapshot = {
  columns: ColumnRow[];
  products: ProductRow[];
  cards: CardRow[];
};

export async function getDbSnapshot(): Promise<DbSnapshot> {
  "use cache";
  cacheLife("max");
  cacheTag("board");

  const [columns, products, cards] = await Promise.all([
    prisma.column.findMany({ orderBy: { order: "asc" } }),
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.card.findMany({ orderBy: [{ columnId: "asc" }, { order: "asc" }] }),
  ]);

  return {
    columns: columns.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      color: c.color,
      order: c.order,
      stageType: c.stageType,
      expectedMinutes: c.expectedMinutes,
    })),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      category: p.category,
      defaultPlannedQty: p.defaultPlannedQty,
    })),
    cards: cards.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      order: c.order,
      columnId: c.columnId,
      lotCode: c.lotCode,
      productId: c.productId,
      plannedQty: c.plannedQty,
      actualQty: c.actualQty,
      batchDate: c.batchDate ? c.batchDate.toISOString() : null,
      shift: c.shift,
      assignee: c.assignee,
      priority: c.priority,
      note: c.note,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  };
}
