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

const ALLERGENS = [
  { code: "wheat", name: "小麦", icon: "小" },
  { code: "egg", name: "卵", icon: "卵" },
  { code: "milk", name: "乳", icon: "乳" },
  { code: "soy", name: "大豆", icon: "大豆" },
  { code: "walnut", name: "くるみ", icon: "胡桃" },
];

const PRODUCT_ALLERGENS: Record<string, string[]> = {
  "BREAD-001": ["wheat", "milk", "egg"],
  "FRENCH-001": ["wheat"],
  "PASTRY-001": ["wheat", "milk", "egg"],
  "SWEET-001": ["wheat", "milk", "egg", "soy"],
  "SWEET-002": ["wheat", "milk", "egg"],
};

const EQUIPMENTS = [
  { name: "ホイロ 1 号", type: "proofer", capacity: 4 },
  { name: "ホイロ 2 号", type: "proofer", capacity: 4 },
  { name: "オーブン A", type: "oven", capacity: 2 },
  { name: "オーブン B", type: "oven", capacity: 2 },
  { name: "オーブン C", type: "oven", capacity: 2 },
];

const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000);

// 当日 / 前日を基準にサンプルデータの日付を動的生成する
const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();
const YESTERDAY = new Date(TODAY.getTime() - 24 * 60 * 60 * 1000);

async function main() {
  // 子テーブルから順に削除
  await prisma.qualityCheck.deleteMany();
  await prisma.stageHistory.deleteMany();
  await prisma.productAllergen.deleteMany();
  await prisma.card.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.allergen.deleteMany();
  await prisma.product.deleteMany();
  await prisma.column.deleteMany();

  for (const stage of STAGES) {
    await prisma.column.create({ data: stage });
  }
  for (const product of PRODUCTS) {
    await prisma.product.create({ data: product });
  }
  for (const eq of EQUIPMENTS) {
    await prisma.equipment.create({ data: eq });
  }
  for (const al of ALLERGENS) {
    await prisma.allergen.create({ data: al });
  }

  // 製品 × アレルゲンの関連付け
  const productList = await prisma.product.findMany();
  const allergenByCode = new Map(
    (await prisma.allergen.findMany()).map((a) => [a.code, a]),
  );
  for (const p of productList) {
    const codes = PRODUCT_ALLERGENS[p.sku] ?? [];
    for (const code of codes) {
      const a = allergenByCode.get(code);
      if (!a) continue;
      await prisma.productAllergen.create({
        data: { productId: p.id, allergenId: a.id },
      });
    }
  }

  const stagesInOrder = await prisma.column.findMany({ orderBy: { order: "asc" } });
  const stageByType = new Map(stagesInOrder.map((s) => [s.stageType ?? "", s]));

  const shokupan = await prisma.product.findUnique({ where: { sku: "BREAD-001" } });
  const french = await prisma.product.findUnique({ where: { sku: "FRENCH-001" } });
  const anpan = await prisma.product.findUnique({ where: { sku: "SWEET-001" } });
  const croissant = await prisma.product.findUnique({ where: { sku: "PASTRY-001" } });

  const proofer1 = await prisma.equipment.findFirst({ where: { name: "ホイロ 1 号" } });
  const ovenA = await prisma.equipment.findFirst({ where: { name: "オーブン A" } });

  // 角食パン: 仕込 10 分前
  if (shokupan && stageByType.get("mixing")) {
    const mixing = stageByType.get("mixing")!;
    const enteredAt = minutesAgo(10);
    const card = await prisma.card.create({
      data: {
        title: "角食パン 朝便",
        columnId: mixing.id,
        order: 1024,
        lotCode: `${toDateStr(TODAY)}-朝-食パン01`,
        productId: shokupan.id,
        plannedQty: 200,
        batchDate: TODAY,
        shift: "morning",
        assignee: "田中",
        priority: "normal",
        currentStageEnteredAt: enteredAt,
      },
    });
    await prisma.stageHistory.create({
      data: { cardId: card.id, columnId: mixing.id, enteredAt },
    });
    await prisma.qualityCheck.create({
      data: {
        cardId: card.id,
        columnId: mixing.id,
        type: "temperature",
        value: "26",
        passed: true,
        note: "生地温度（℃）",
        byUser: "田中",
        checkedAt: minutesAgo(8),
      },
    });
  }

  // フランスパン: 一次発酵中
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
        lotCode: `${toDateStr(TODAY)}-朝-フランス01`,
        productId: french.id,
        equipmentId: proofer1?.id ?? null,
        plannedQty: 80,
        batchDate: TODAY,
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
    await prisma.qualityCheck.createMany({
      data: [
        {
          cardId: card.id,
          columnId: mixing.id,
          type: "temperature",
          value: "25",
          passed: true,
          note: "生地温度（℃）",
          byUser: "佐藤",
          checkedAt: minutesAgo(40),
        },
        {
          cardId: card.id,
          columnId: firstProof.id,
          type: "humidity",
          value: "75",
          passed: true,
          note: "ホイロ湿度（%）",
          byUser: "佐藤",
          checkedAt: minutesAgo(18),
        },
      ],
    });
  }

  // あんパン: 焼成中（残り 2 分）
  if (anpan && stageByType.get("bake")) {
    const bake = stageByType.get("bake")!;
    const enteredAt = minutesAgo(28);

    const previousStageTypes = ["mixing", "firstProof", "divide", "bench", "mold", "finalProof"];
    let cursor = new Date(Date.now() - (28 + 195) * 60 * 1000);

    const card = await prisma.card.create({
      data: {
        title: "あんパン 朝便",
        columnId: bake.id,
        order: 1024,
        lotCode: `${toDateStr(TODAY)}-朝-あんパン01`,
        productId: anpan.id,
        equipmentId: ovenA?.id ?? null,
        plannedQty: 120,
        batchDate: TODAY,
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

    await prisma.qualityCheck.create({
      data: {
        cardId: card.id,
        columnId: bake.id,
        type: "temperature",
        value: "92",
        passed: true,
        note: "中心温度（℃）",
        byUser: "鈴木",
        checkedAt: minutesAgo(1),
      },
    });
  }

  // クロワッサン: 昨日完了
  if (croissant) {
    const ship = stageByType.get("ship");
    if (!ship) return;
    const startedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const card = await prisma.card.create({
      data: {
        title: "クロワッサン 朝便",
        columnId: ship.id,
        order: 1024,
        lotCode: `${toDateStr(YESTERDAY)}-朝-クロワッサン01`,
        productId: croissant.id,
        plannedQty: 150,
        actualQty: 148,
        batchDate: YESTERDAY,
        shift: "morning",
        assignee: "高橋",
        priority: "normal",
        currentStageEnteredAt: startedAt,
      },
    });

    let cursor = startedAt;
    let lastEnteredAt = startedAt;
    for (const stage of stagesInOrder) {
      const mins = (stage.expectedMinutes ?? 20) + Math.floor(Math.random() * 6) - 2;
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

    // クロワッサンには複数の品質チェック（昨日分）
    const inspect = stageByType.get("inspect");
    const bake = stageByType.get("bake");
    if (inspect && bake) {
      await prisma.qualityCheck.createMany({
        data: [
          {
            cardId: card.id,
            columnId: bake.id,
            type: "temperature",
            value: "94",
            passed: true,
            note: "中心温度（℃）",
            byUser: "高橋",
            checkedAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
          },
          {
            cardId: card.id,
            columnId: inspect.id,
            type: "weight",
            value: "65",
            passed: true,
            note: "重量サンプル平均（g）",
            byUser: "高橋",
            checkedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
          },
          {
            cardId: card.id,
            columnId: inspect.id,
            type: "visual",
            value: "層構造良好",
            passed: true,
            note: "焼き色・層の確認",
            byUser: "高橋",
            checkedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
          },
        ],
      });
    }
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
