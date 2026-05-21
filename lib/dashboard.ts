import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "./prisma";

export type DashboardStage = {
  id: string;
  name: string;
  color: string;
  stageType: string | null;
  cardCount: number;
};

export type DashboardProductSummary = {
  id: string;
  name: string;
  cardCount: number;
};

export type DashboardRecentBatch = {
  id: string;
  lotCode: string | null;
  productName: string;
  stageName: string;
  shift: string | null;
  assignee: string | null;
  priority: string;
  createdAt: string;
};

export type DashboardSummary = {
  stages: DashboardStage[];
  products: DashboardProductSummary[];
  totals: {
    total: number;
    highPriority: number;
    inProgress: number;
    shipped: number;
  };
  recent: DashboardRecentBatch[];
};

export async function getDashboardSummary(): Promise<DashboardSummary> {
  "use cache";
  cacheLife("max");
  cacheTag("board");

  const [stages, products] = await Promise.all([
    prisma.column.findMany({
      orderBy: { order: "asc" },
      include: { cards: { include: { product: true } } },
    }),
    prisma.product.findMany({ orderBy: { name: "asc" } }),
  ]);

  const stageById = new Map(stages.map((s) => [s.id, s]));
  const allCards = stages.flatMap((s) => s.cards);

  const shipStageIds = new Set(stages.filter((s) => s.stageType === "ship").map((s) => s.id));
  const shipped = allCards.filter((c) => shipStageIds.has(c.columnId)).length;

  return {
    stages: stages.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      stageType: s.stageType,
      cardCount: s.cards.length,
    })),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      cardCount: allCards.filter((c) => c.productId === p.id).length,
    })),
    totals: {
      total: allCards.length,
      highPriority: allCards.filter((c) => c.priority === "high").length,
      inProgress: allCards.length - shipped,
      shipped,
    },
    recent: [...allCards]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5)
      .map((c) => {
        const stage = stageById.get(c.columnId);
        return {
          id: c.id,
          lotCode: c.lotCode,
          productName: c.product?.name ?? c.title,
          stageName: stage?.name ?? "(不明)",
          shift: c.shift,
          assignee: c.assignee,
          priority: c.priority,
          createdAt: c.createdAt.toISOString(),
        };
      }),
  };
}
