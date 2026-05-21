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

const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000);

async function main() {
  // 既存データを全消去してから入れ直す（デモ用シード）。
  await prisma.stageHistory.deleteMany();
  await prisma.card.deleteMany();
  await prisma.product.deleteMany();
  await prisma.column.deleteMany();

  for (const stage of STAGES) {
    await prisma.column.create({ data: stage });
  }
  for (const product of PRODUCTS) {
    await prisma.product.create({ data: product });
  }

  // 全ステージを取得して順序を確定
  const stagesInOrder = await prisma.column.findMany({ orderBy: { order: "asc" } });
  const stageByType = new Map(stagesInOrder.map((s) => [s.stageType ?? "", s]));

  const shokupan = await prisma.product.findUnique({ where: { sku: "BREAD-001" } });
  const french = await prisma.product.findUnique({ where: { sku: "FRENCH-001" } });
  const anpan = await prisma.product.findUnique({ where: { sku: "SWEET-001" } });
  const croissant = await prisma.product.findUnique({ where: { sku: "PASTRY-001" } });

  // ── 現在進行中バッチ（3 件） ──────────────────────────────────────────
  // 角食パン: 仕込工程に 10 分前から滞在
  if (shokupan && stageByType.get("mixing")) {
    const mixing = stageByType.get("mixing")!;
    const enteredAt = minutesAgo(10);
    const card = await prisma.card.create({
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
        currentStageEnteredAt: enteredAt,
      },
    });
    await prisma.stageHistory.create({
      data: { cardId: card.id, columnId: mixing.id, enteredAt },
    });
  }

  // フランスパン: 仕込 → 一次発酵に進んで 20 分滞在中（仕込履歴は完了）
  if (french && stageByType.get("firstProof") && stageByType.get("mixing")) {
    const mixing = stageByType.get("mixing")!;
    const firstProof = stageByType.get("firstProof")!;
    const mixEntered = minutesAgo(55);
    const mixLeft = minutesAgo(20);
    const proofEntered = minutesAgo(20);

    const card = await prisma.card.create({
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
        currentStageEnteredAt: proofEntered,
      },
    });
    await prisma.stageHistory.createMany({
      data: [
        {
          cardId: card.id,
          columnId: mixing.id,
          enteredAt: mixEntered,
          leftAt: mixLeft,
          durationSec: Math.floor((mixLeft.getTime() - mixEntered.getTime()) / 1000),
        },
        { cardId: card.id, columnId: firstProof.id, enteredAt: proofEntered },
      ],
    });
  }

  // あんパン: 焼成中（前 6 工程は通過済み、現在は 5 分前から焼成中）
  if (anpan && stageByType.get("bake")) {
    const bake = stageByType.get("bake")!;
    const enteredAt = minutesAgo(5);

    const previousStageTypes = ["mixing", "firstProof", "divide", "bench", "mold", "finalProof"];
    let cursor = new Date(Date.now() - (5 + 195) * 60 * 1000); // 焼成 5 分前 + 過去 195 分

    const card = await prisma.card.create({
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
        currentStageEnteredAt: enteredAt,
      },
    });

    for (const type of previousStageTypes) {
      const stage = stageByType.get(type);
      if (!stage || !stage.expectedMinutes) continue;
      const mins = stage.expectedMinutes;
      const entered = new Date(cursor);
      const left = new Date(cursor.getTime() + mins * 60 * 1000);
      await prisma.stageHistory.create({
        data: {
          cardId: card.id,
          columnId: stage.id,
          enteredAt: entered,
          leftAt: left,
          durationSec: mins * 60,
        },
      });
      cursor = left;
    }
    await prisma.stageHistory.create({
      data: { cardId: card.id, columnId: bake.id, enteredAt },
    });
  }

  // ── 完了済みバッチ（昨日 1 件） — 平均滞留時間の元データに ───────────
  if (croissant) {
    const ship = stageByType.get("ship");
    if (!ship) return;
    const startedAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 時間前

    const card = await prisma.card.create({
      data: {
        title: "クロワッサン 朝便",
        columnId: ship.id,
        order: 1024,
        lotCode: "2026-05-21-朝-クロワッサン01",
        productId: croissant.id,
        plannedQty: 150,
        actualQty: 148,
        batchDate: new Date("2026-05-21T00:00:00"),
        shift: "morning",
        assignee: "高橋",
        priority: "normal",
        currentStageEnteredAt: startedAt, // 後で更新
      },
    });

    let cursor = startedAt;
    let lastEnteredAt = startedAt;
    for (const stage of stagesInOrder) {
      const mins = (stage.expectedMinutes ?? 20) + Math.floor(Math.random() * 6) - 2; // 標準±2 分の揺らぎ
      const entered = new Date(cursor);
      const left = new Date(cursor.getTime() + mins * 60 * 1000);
      const isLast = stage.id === ship.id;
      await prisma.stageHistory.create({
        data: {
          cardId: card.id,
          columnId: stage.id,
          enteredAt: entered,
          leftAt: isLast ? null : left,
          durationSec: isLast ? null : mins * 60,
        },
      });
      cursor = left;
      if (isLast) lastEnteredAt = entered;
    }
    await prisma.card.update({
      where: { id: card.id },
      data: { currentStageEnteredAt: lastEnteredAt },
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
