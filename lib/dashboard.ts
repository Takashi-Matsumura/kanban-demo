import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "./prisma";
import { equipmentTypeForStage } from "./stage-equipment";

export type DashboardStage = {
  id: string;
  name: string;
  color: string;
  stageType: string | null;
  cardCount: number;
  expectedMinutes: number | null;
  avgDwellMinutes: number | null;
};

export type DashboardProductSummary = {
  id: string;
  name: string;
  cardCount: number;
};

export type DashboardAllergenSummary = {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  cardCount: number;
};

export type DashboardAttention = {
  id: string;
  lotCode: string | null;
  productName: string;
  stageName: string;
  stageColor: string;
  assignee: string | null;
  reasons: ("overdue" | "failedQuality" | "noEquipment")[];
  /** 標準超過の場合: 標準超過時間 */
  overdueMinutes: number | null;
};

export type DashboardSummary = {
  stages: DashboardStage[];
  products: DashboardProductSummary[];
  allergens: DashboardAllergenSummary[];
  totals: {
    total: number;
    attention: number;
    inProgress: number;
    shipped: number;
  };
  attentions: DashboardAttention[];
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function getDashboardSummary(): Promise<DashboardSummary> {
  "use cache";
  cacheLife("max");
  cacheTag("board");

  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);
  const now = Date.now();

  const [stages, products, histories] = await Promise.all([
    prisma.column.findMany({
      orderBy: { order: "asc" },
      include: {
        cards: {
          include: {
            product: { include: { allergens: { include: { allergen: true } } } },
            qualityChecks: { select: { passed: true } },
          },
        },
      },
    }),
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.stageHistory.findMany({
      where: { enteredAt: { gte: sevenDaysAgo }, durationSec: { not: null } },
      select: { columnId: true, durationSec: true },
    }),
  ]);

  const sumByCol = new Map<string, { sum: number; count: number }>();
  for (const h of histories) {
    if (h.durationSec == null) continue;
    const e = sumByCol.get(h.columnId) ?? { sum: 0, count: 0 };
    e.sum += h.durationSec;
    e.count += 1;
    sumByCol.set(h.columnId, e);
  }

  const allCards = stages.flatMap((s) => s.cards);
  const shipStageIds = new Set(stages.filter((s) => s.stageType === "ship").map((s) => s.id));
  const shipped = allCards.filter((c) => shipStageIds.has(c.columnId)).length;

  const attentions: DashboardAttention[] = [];
  for (const stage of stages) {
    const equipType = equipmentTypeForStage(stage.stageType);
    for (const card of stage.cards) {
      const reasons: DashboardAttention["reasons"] = [];
      let overdueMinutes: number | null = null;

      if (stage.expectedMinutes && stage.expectedMinutes > 0) {
        const elapsedMin = Math.floor(
          (now - card.currentStageEnteredAt.getTime()) / 60000,
        );
        if (elapsedMin > stage.expectedMinutes) {
          reasons.push("overdue");
          overdueMinutes = elapsedMin - stage.expectedMinutes;
        }
      }
      if (card.qualityChecks.some((q) => !q.passed)) {
        reasons.push("failedQuality");
      }
      if (equipType && !card.equipmentId) {
        reasons.push("noEquipment");
      }

      if (reasons.length === 0) continue;
      attentions.push({
        id: card.id,
        lotCode: card.lotCode,
        productName: card.product?.name ?? card.title,
        stageName: stage.name,
        stageColor: stage.color,
        assignee: card.assignee,
        reasons,
        overdueMinutes,
      });
    }
  }
  // 優先度: overdue を上に、超過分が大きい順
  attentions.sort((a, b) => {
    const aHasOverdue = a.reasons.includes("overdue") ? 1 : 0;
    const bHasOverdue = b.reasons.includes("overdue") ? 1 : 0;
    if (aHasOverdue !== bHasOverdue) return bHasOverdue - aHasOverdue;
    return (b.overdueMinutes ?? 0) - (a.overdueMinutes ?? 0);
  });

  // アレルゲン別: 進行中（出荷以外）バッチが含むアレルゲン
  const allergenCounter = new Map<
    string,
    { id: string; code: string; name: string; icon: string | null; count: number }
  >();
  for (const card of allCards) {
    if (shipStageIds.has(card.columnId)) continue;
    if (!card.product) continue;
    for (const pa of card.product.allergens) {
      const a = pa.allergen;
      const e =
        allergenCounter.get(a.id) ??
        { id: a.id, code: a.code, name: a.name, icon: a.icon, count: 0 };
      e.count += 1;
      allergenCounter.set(a.id, e);
    }
  }
  const allergens: DashboardAllergenSummary[] = Array.from(allergenCounter.values())
    .map((e) => ({
      id: e.id,
      code: e.code,
      name: e.name,
      icon: e.icon,
      cardCount: e.count,
    }))
    .sort((a, b) => b.cardCount - a.cardCount);

  return {
    stages: stages.map((s) => {
      const agg = sumByCol.get(s.id);
      const avgDwellMinutes =
        agg && agg.count > 0 ? Math.round(agg.sum / agg.count / 60) : null;
      return {
        id: s.id,
        name: s.name,
        color: s.color,
        stageType: s.stageType,
        cardCount: s.cards.length,
        expectedMinutes: s.expectedMinutes,
        avgDwellMinutes,
      };
    }),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      cardCount: allCards.filter((c) => c.productId === p.id).length,
    })),
    allergens,
    totals: {
      total: allCards.length,
      attention: attentions.length,
      inProgress: allCards.length - shipped,
      shipped,
    },
    attentions: attentions.slice(0, 6),
  };
}

