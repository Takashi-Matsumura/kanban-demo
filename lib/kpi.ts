import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "./prisma";

export type KpiStageStat = {
  id: string;
  name: string;
  color: string;
  stageType: string | null;
  expectedMinutes: number | null;
  avgMinutes: number | null;
  sampleCount: number;
};

export type KpiBottleneck = {
  stageId: string;
  stageName: string;
  expectedMinutes: number;
  avgMinutes: number;
  ratio: number;
};

export type KpiAllergenSummary = {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  shippedBatchCount: number;
};

export type KpiQualityFailure = {
  id: string;
  cardId: string;
  cardLotCode: string | null;
  productName: string | null;
  stageName: string;
  type: string;
  value: string | null;
  note: string | null;
  byUser: string | null;
  checkedAt: string;
};

export type KpiSummary = {
  yesterday: {
    completedBatches: number;
  };
  lastWeek: {
    completedBatches: number;
    avgLeadTimeMinutes: number | null;
    leadTimeSampleCount: number;
  };
  stages: KpiStageStat[];
  bottleneck: KpiBottleneck | null;
  allergens: KpiAllergenSummary[];
  quality: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    recentFailures: KpiQualityFailure[];
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * DAY_MS;

export async function getKpiSummary(): Promise<KpiSummary> {
  "use cache";
  cacheLife("max");
  cacheTag("board");

  const now = Date.now();
  const yesterdayStart = new Date(now - 2 * DAY_MS);
  const yesterdayEnd = new Date(now - DAY_MS);
  const sevenDaysAgo = new Date(now - SEVEN_DAYS_MS);

  const [stages, shipStages] = await Promise.all([
    prisma.column.findMany({ orderBy: { order: "asc" } }),
    prisma.column.findMany({ where: { stageType: "ship" } }),
  ]);
  const shipStageIds = shipStages.map((s) => s.id);

  const [yesterdayCompletions, lastWeekShipHistories, lastWeekHistories, lastWeekQuality, recentFailures] =
    await Promise.all([
      prisma.stageHistory.count({
        where: {
          columnId: { in: shipStageIds },
          enteredAt: { gte: yesterdayStart, lt: yesterdayEnd },
        },
      }),
      prisma.stageHistory.findMany({
        where: { columnId: { in: shipStageIds }, enteredAt: { gte: sevenDaysAgo } },
        select: { cardId: true, enteredAt: true },
      }),
      prisma.stageHistory.findMany({
        where: { enteredAt: { gte: sevenDaysAgo }, durationSec: { not: null } },
        select: { columnId: true, durationSec: true },
      }),
      prisma.qualityCheck.findMany({
        where: { checkedAt: { gte: sevenDaysAgo } },
        select: { passed: true },
      }),
      prisma.qualityCheck.findMany({
        where: { passed: false },
        orderBy: { checkedAt: "desc" },
        take: 5,
        include: {
          card: { include: { product: true } },
          column: true,
        },
      }),
    ]);

  // 過去 7 日に出荷したバッチのリードタイム = 最初の history の enteredAt → ship history の enteredAt
  const shippedCardIds = lastWeekShipHistories.map((h) => h.cardId);
  const firstHistoriesAll = shippedCardIds.length
    ? await prisma.stageHistory.findMany({
        where: { cardId: { in: shippedCardIds } },
        orderBy: { enteredAt: "asc" },
        select: { cardId: true, enteredAt: true },
      })
    : [];

  const firstByCard = new Map<string, Date>();
  for (const h of firstHistoriesAll) {
    if (!firstByCard.has(h.cardId)) firstByCard.set(h.cardId, h.enteredAt);
  }

  let leadTimeSum = 0;
  let leadTimeCount = 0;
  for (const sh of lastWeekShipHistories) {
    const first = firstByCard.get(sh.cardId);
    if (!first) continue;
    const ms = sh.enteredAt.getTime() - first.getTime();
    if (ms > 0) {
      leadTimeSum += ms;
      leadTimeCount += 1;
    }
  }
  const avgLeadTimeMinutes =
    leadTimeCount > 0 ? Math.round(leadTimeSum / leadTimeCount / 60000) : null;

  // 工程別の平均滞留時間（過去 7 日、durationSec が記録済みのもの）
  const sumByCol = new Map<string, { sum: number; count: number }>();
  for (const h of lastWeekHistories) {
    if (h.durationSec == null) continue;
    const e = sumByCol.get(h.columnId) ?? { sum: 0, count: 0 };
    e.sum += h.durationSec;
    e.count += 1;
    sumByCol.set(h.columnId, e);
  }

  const stageStats: KpiStageStat[] = stages.map((s) => {
    const agg = sumByCol.get(s.id);
    const avg = agg && agg.count > 0 ? Math.round(agg.sum / agg.count / 60) : null;
    return {
      id: s.id,
      name: s.name,
      color: s.color,
      stageType: s.stageType,
      expectedMinutes: s.expectedMinutes,
      avgMinutes: avg,
      sampleCount: agg?.count ?? 0,
    };
  });

  // ボトルネック = avg / expected が最大の工程（少なくとも 1 件のサンプル & expected > 0）
  let bottleneck: KpiBottleneck | null = null;
  for (const s of stageStats) {
    if (s.avgMinutes == null || s.expectedMinutes == null || s.expectedMinutes <= 0) continue;
    const ratio = s.avgMinutes / s.expectedMinutes;
    if (!bottleneck || ratio > bottleneck.ratio) {
      bottleneck = {
        stageId: s.id,
        stageName: s.name,
        expectedMinutes: s.expectedMinutes,
        avgMinutes: s.avgMinutes,
        ratio,
      };
    }
  }

  // アレルゲン別出荷数（過去 7 日に出荷したバッチの製品アレルゲン）
  const shippedCards = shippedCardIds.length
    ? await prisma.card.findMany({
        where: { id: { in: shippedCardIds } },
        include: { product: { include: { allergens: { include: { allergen: true } } } } },
      })
    : [];

  const allergenCounter = new Map<
    string,
    { id: string; code: string; name: string; icon: string | null; count: number }
  >();
  for (const card of shippedCards) {
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
  const allergens: KpiAllergenSummary[] = Array.from(allergenCounter.values())
    .map((e) => ({
      id: e.id,
      code: e.code,
      name: e.name,
      icon: e.icon,
      shippedBatchCount: e.count,
    }))
    .sort((a, b) => b.shippedBatchCount - a.shippedBatchCount);

  // 品質
  const qTotal = lastWeekQuality.length;
  const qPassed = lastWeekQuality.filter((q) => q.passed).length;
  const qFailed = qTotal - qPassed;
  const passRate = qTotal > 0 ? qPassed / qTotal : 1;

  return {
    yesterday: { completedBatches: yesterdayCompletions },
    lastWeek: {
      completedBatches: lastWeekShipHistories.length,
      avgLeadTimeMinutes,
      leadTimeSampleCount: leadTimeCount,
    },
    stages: stageStats,
    bottleneck,
    allergens,
    quality: {
      total: qTotal,
      passed: qPassed,
      failed: qFailed,
      passRate,
      recentFailures: recentFailures.map((f) => ({
        id: f.id,
        cardId: f.cardId,
        cardLotCode: f.card.lotCode,
        productName: f.card.product?.name ?? null,
        stageName: f.column.name,
        type: f.type,
        value: f.value,
        note: f.note,
        byUser: f.byUser,
        checkedAt: f.checkedAt.toISOString(),
      })),
    },
  };
}
