import { prisma } from "../lib/prisma";

const STAGES = [
  { name: "仕込", description: "計量・ミキシング", color: "sky", order: 0, stageType: "mixing", expectedMinutes: 30 },
  { name: "一次発酵", description: "一次発酵（ホイロ）", color: "amber", order: 1, stageType: "firstProof", expectedMinutes: 60 },
  { name: "分割・丸め", description: "生地を分割して丸める", color: "sky", order: 2, stageType: "divide", expectedMinutes: 20 },
  { name: "ベンチタイム", description: "成形前の休ませ", color: "amber", order: 3, stageType: "bench", expectedMinutes: 15 },
  { name: "成形", description: "最終成形", color: "sky", order: 4, stageType: "mold", expectedMinutes: 25 },
  { name: "二次発酵", description: "仕上げ発酵（ホイロ）", color: "amber", order: 5, stageType: "finalProof", expectedMinutes: 45 },
  { name: "焼成", description: "オーブンで焼成", color: "red", order: 6, stageType: "bake", expectedMinutes: 30 },
  { name: "冷却", description: "ラックで冷却", color: "blue", order: 7, stageType: "cool", expectedMinutes: 30 },
  { name: "包装", description: "袋詰め・ラベル貼り", color: "purple", order: 8, stageType: "pack", expectedMinutes: 20 },
  { name: "検品", description: "重量・外観チェック", color: "purple", order: 9, stageType: "inspect", expectedMinutes: 10 },
  { name: "出荷", description: "便ごとに集約", color: "green", order: 10, stageType: "ship", expectedMinutes: 15 },
];

const PRODUCTS = [
  { name: "角食パン", sku: "BREAD-001", category: "食パン", defaultPlannedQty: 200 },
  { name: "フランスパン", sku: "FRENCH-001", category: "ハードパン", defaultPlannedQty: 80 },
  { name: "クロワッサン", sku: "PASTRY-001", category: "ペストリー", defaultPlannedQty: 150 },
  { name: "あんパン", sku: "SWEET-001", category: "菓子パン", defaultPlannedQty: 120 },
  { name: "メロンパン", sku: "SWEET-002", category: "菓子パン", defaultPlannedQty: 120 },
];

async function main() {
  // 既存データを全消去してから入れ直す（デモ用シード）。
  await prisma.card.deleteMany();
  await prisma.product.deleteMany();
  await prisma.column.deleteMany();

  for (const stage of STAGES) {
    await prisma.column.create({ data: stage });
  }
  for (const product of PRODUCTS) {
    await prisma.product.create({ data: product });
  }

  // サンプルバッチを少しだけ入れる（仕込・一次発酵・焼成）
  const mixing = await prisma.column.findUnique({ where: { stageType: "mixing" } });
  const firstProof = await prisma.column.findUnique({ where: { stageType: "firstProof" } });
  const bake = await prisma.column.findUnique({ where: { stageType: "bake" } });
  const shokupan = await prisma.product.findUnique({ where: { sku: "BREAD-001" } });
  const french = await prisma.product.findUnique({ where: { sku: "FRENCH-001" } });
  const anpan = await prisma.product.findUnique({ where: { sku: "SWEET-001" } });

  if (mixing && shokupan) {
    await prisma.card.create({
      data: {
        title: "角食パン 朝便",
        columnId: mixing.id,
        order: 1024,
        lotCode: "2026-05-22-朝-食パン01",
        productId: shokupan.id,
        plannedQty: 200,
        batchDate: new Date("2026-05-22T00:00:00"),
        shift: "morning",
        assignee: "田中",
        priority: "normal",
      },
    });
  }
  if (firstProof && french) {
    await prisma.card.create({
      data: {
        title: "フランスパン 朝便",
        columnId: firstProof.id,
        order: 1024,
        lotCode: "2026-05-22-朝-フランス01",
        productId: french.id,
        plannedQty: 80,
        batchDate: new Date("2026-05-22T00:00:00"),
        shift: "morning",
        assignee: "佐藤",
        priority: "high",
        note: "新人ペア作業のため要フォロー",
      },
    });
  }
  if (bake && anpan) {
    await prisma.card.create({
      data: {
        title: "あんパン 朝便",
        columnId: bake.id,
        order: 1024,
        lotCode: "2026-05-22-朝-あんパン01",
        productId: anpan.id,
        plannedQty: 120,
        batchDate: new Date("2026-05-22T00:00:00"),
        shift: "morning",
        assignee: "鈴木",
        priority: "normal",
      },
    });
  }
}

main()
  .then(async () => {
    console.log("Seed completed.");
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
