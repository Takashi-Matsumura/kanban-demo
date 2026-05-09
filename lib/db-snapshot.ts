import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "./prisma";

export type ColumnRow = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  order: number;
};

export type CardRow = {
  id: string;
  title: string;
  description: string | null;
  order: number;
  columnId: string;
  createdAt: string;
  updatedAt: string;
};

export type DbSnapshot = {
  columns: ColumnRow[];
  cards: CardRow[];
};

export async function getDbSnapshot(): Promise<DbSnapshot> {
  "use cache";
  cacheLife("max");
  cacheTag("board");

  const [columns, cards] = await Promise.all([
    prisma.column.findMany({ orderBy: { order: "asc" } }),
    prisma.card.findMany({ orderBy: [{ columnId: "asc" }, { order: "asc" }] }),
  ]);

  return {
    columns: columns.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      color: c.color,
      order: c.order,
    })),
    cards: cards.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      order: c.order,
      columnId: c.columnId,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  };
}
