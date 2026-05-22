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

export type AllergenRow = {
  id: string;
  code: string;
  name: string;
  icon: string | null;
};

export type ProductAllergenRow = {
  productId: string;
  allergenId: string;
};

export type EquipmentRow = {
  id: string;
  name: string;
  type: string;
  capacity: number | null;
  isActive: boolean;
};

export type CardRow = {
  id: string;
  title: string;
  description: string | null;
  order: number;
  columnId: string;
  lotCode: string | null;
  productId: string | null;
  equipmentId: string | null;
  plannedQty: number | null;
  actualQty: number | null;
  batchDate: string | null;
  shift: string | null;
  assignee: string | null;
  priority: string;
  note: string | null;
  currentStageEnteredAt: string;
  targetReadyAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StageHistoryRow = {
  id: string;
  cardId: string;
  columnId: string;
  enteredAt: string;
  leftAt: string | null;
  durationSec: number | null;
  byUser: string | null;
};

export type QualityCheckRow = {
  id: string;
  cardId: string;
  columnId: string;
  type: string;
  value: string | null;
  passed: boolean;
  note: string | null;
  byUser: string | null;
  checkedAt: string;
};

export type DbSnapshot = {
  columns: ColumnRow[];
  products: ProductRow[];
  allergens: AllergenRow[];
  productAllergens: ProductAllergenRow[];
  equipments: EquipmentRow[];
  cards: CardRow[];
  histories: StageHistoryRow[];
  qualityChecks: QualityCheckRow[];
};

export async function getDbSnapshot(): Promise<DbSnapshot> {
  "use cache";
  cacheLife("max");
  cacheTag("board");

  const [columns, products, allergens, productAllergens, equipments, cards, histories, qualityChecks] =
    await Promise.all([
      prisma.column.findMany({ orderBy: { order: "asc" } }),
      prisma.product.findMany({ orderBy: { name: "asc" } }),
      prisma.allergen.findMany({ orderBy: { name: "asc" } }),
      prisma.productAllergen.findMany(),
      prisma.equipment.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] }),
      prisma.card.findMany({ orderBy: [{ columnId: "asc" }, { order: "asc" }] }),
      prisma.stageHistory.findMany({ orderBy: { enteredAt: "desc" }, take: 50 }),
      prisma.qualityCheck.findMany({ orderBy: { checkedAt: "desc" }, take: 50 }),
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
    allergens: allergens.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      icon: a.icon,
    })),
    productAllergens: productAllergens.map((pa) => ({
      productId: pa.productId,
      allergenId: pa.allergenId,
    })),
    equipments: equipments.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      capacity: e.capacity,
      isActive: e.isActive,
    })),
    cards: cards.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      order: c.order,
      columnId: c.columnId,
      lotCode: c.lotCode,
      productId: c.productId,
      equipmentId: c.equipmentId,
      plannedQty: c.plannedQty,
      actualQty: c.actualQty,
      batchDate: c.batchDate ? c.batchDate.toISOString() : null,
      shift: c.shift,
      assignee: c.assignee,
      priority: c.priority,
      note: c.note,
      currentStageEnteredAt: c.currentStageEnteredAt.toISOString(),
      targetReadyAt: c.targetReadyAt ? c.targetReadyAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    histories: histories.map((h) => ({
      id: h.id,
      cardId: h.cardId,
      columnId: h.columnId,
      enteredAt: h.enteredAt.toISOString(),
      leftAt: h.leftAt ? h.leftAt.toISOString() : null,
      durationSec: h.durationSec,
      byUser: h.byUser,
    })),
    qualityChecks: qualityChecks.map((q) => ({
      id: q.id,
      cardId: q.cardId,
      columnId: q.columnId,
      type: q.type,
      value: q.value,
      passed: q.passed,
      note: q.note,
      byUser: q.byUser,
      checkedAt: q.checkedAt.toISOString(),
    })),
  };
}
