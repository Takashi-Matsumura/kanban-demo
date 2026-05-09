import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "./prisma";

export type BoardCard = {
  id: string;
  title: string;
  description: string | null;
  order: number;
  columnId: string;
};

export type BoardColumn = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  order: number;
  cards: BoardCard[];
};

export async function getBoard(): Promise<BoardColumn[]> {
  "use cache";
  cacheLife("max");
  cacheTag("board");

  const columns = await prisma.column.findMany({
    orderBy: { order: "asc" },
    include: {
      cards: { orderBy: { order: "asc" } },
    },
  });

  return columns.map((column) => ({
    id: column.id,
    name: column.name,
    description: column.description,
    color: column.color,
    order: column.order,
    cards: column.cards.map((card) => ({
      id: card.id,
      title: card.title,
      description: card.description,
      order: card.order,
      columnId: card.columnId,
    })),
  }));
}
