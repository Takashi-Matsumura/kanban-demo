import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "./prisma";
import { equipmentTypeForStage } from "./stage-equipment";

export { equipmentTypeForStage };

export type BoardAllergen = {
  id: string;
  code: string;
  name: string;
  icon: string | null;
};

export type BoardProduct = {
  id: string;
  name: string;
  sku: string;
  category: string;
  allergens: BoardAllergen[];
};

export type BoardEquipment = {
  id: string;
  name: string;
  type: string;
  capacity: number | null;
};

export type BoardQualityCheck = {
  id: string;
  columnId: string;
  type: string;
  value: string | null;
  passed: boolean;
  note: string | null;
  byUser: string | null;
  checkedAt: string;
};

export type BoardStageHistory = {
  id: string;
  columnId: string;
  enteredAt: string;
  leftAt: string | null;
  durationSec: number | null;
};

export type BoardCard = {
  id: string;
  title: string;
  description: string | null;
  order: number;
  columnId: string;
  lotCode: string | null;
  product: BoardProduct | null;
  equipment: BoardEquipment | null;
  plannedQty: number | null;
  actualQty: number | null;
  batchDate: string | null;
  shift: string | null;
  assignee: string | null;
  priority: string;
  note: string | null;
  currentStageEnteredAt: string;
  targetReadyAt: string | null;
  qualityChecks: BoardQualityCheck[];
  histories: BoardStageHistory[];
  hasFailedQuality: boolean;
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
  /** この工程で使う設備種別（"proofer" | "oven" | null）。stageType から導出 */
  equipmentType: string | null;
  wipCount: number;
  avgDwellMinutes: number | null;
  cards: BoardCard[];
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function getBoard(): Promise<BoardColumn[]> {
  "use cache";
  cacheLife("max");
  cacheTag("board");

  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);

  const [columns, histories] = await Promise.all([
    prisma.column.findMany({
      orderBy: { order: "asc" },
      include: {
        cards: {
          orderBy: { order: "asc" },
          include: {
            product: { include: { allergens: { include: { allergen: true } } } },
            equipment: true,
            qualityChecks: { orderBy: { checkedAt: "desc" } },
            histories: { orderBy: { enteredAt: "asc" } },
          },
        },
      },
    }),
    prisma.stageHistory.findMany({
      where: {
        enteredAt: { gte: sevenDaysAgo },
        durationSec: { not: null },
      },
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

  return columns.map((column) => {
    const agg = sumByCol.get(column.id);
    const avgDwellMinutes =
      agg && agg.count > 0 ? Math.round(agg.sum / agg.count / 60) : null;

    return {
      id: column.id,
      name: column.name,
      description: column.description,
      color: column.color,
      order: column.order,
      stageType: column.stageType,
      expectedMinutes: column.expectedMinutes,
      equipmentType: equipmentTypeForStage(column.stageType),
      wipCount: column.cards.length,
      avgDwellMinutes,
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
              allergens: card.product.allergens.map((pa) => ({
                id: pa.allergen.id,
                code: pa.allergen.code,
                name: pa.allergen.name,
                icon: pa.allergen.icon,
              })),
            }
          : null,
        equipment: card.equipment
          ? {
              id: card.equipment.id,
              name: card.equipment.name,
              type: card.equipment.type,
              capacity: card.equipment.capacity,
            }
          : null,
        plannedQty: card.plannedQty,
        actualQty: card.actualQty,
        batchDate: card.batchDate ? card.batchDate.toISOString() : null,
        shift: card.shift,
        assignee: card.assignee,
        priority: card.priority,
        note: card.note,
        currentStageEnteredAt: card.currentStageEnteredAt.toISOString(),
        targetReadyAt: card.targetReadyAt ? card.targetReadyAt.toISOString() : null,
        qualityChecks: card.qualityChecks.map((q) => ({
          id: q.id,
          columnId: q.columnId,
          type: q.type,
          value: q.value,
          passed: q.passed,
          note: q.note,
          byUser: q.byUser,
          checkedAt: q.checkedAt.toISOString(),
        })),
        histories: card.histories.map((h) => ({
          id: h.id,
          columnId: h.columnId,
          enteredAt: h.enteredAt.toISOString(),
          leftAt: h.leftAt ? h.leftAt.toISOString() : null,
          durationSec: h.durationSec,
        })),
        hasFailedQuality: card.qualityChecks.some((q) => !q.passed),
        createdAt: card.createdAt.toISOString(),
        updatedAt: card.updatedAt.toISOString(),
      })),
    };
  });
}

export async function getProducts(): Promise<BoardProduct[]> {
  "use cache";
  cacheLife("max");
  cacheTag("board");

  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: { allergens: { include: { allergen: true } } },
  });
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    category: p.category,
    allergens: p.allergens.map((pa) => ({
      id: pa.allergen.id,
      code: pa.allergen.code,
      name: pa.allergen.name,
      icon: pa.allergen.icon,
    })),
  }));
}

export async function getEquipments(): Promise<BoardEquipment[]> {
  "use cache";
  cacheLife("max");
  cacheTag("board");

  const equipments = await prisma.equipment.findMany({
    where: { isActive: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  return equipments.map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    capacity: e.capacity,
  }));
}
