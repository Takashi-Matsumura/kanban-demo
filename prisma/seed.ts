import { prisma } from "../lib/prisma";

const COLUMNS = [
  { name: "Todo", description: "未着手の項目", color: "green", order: 0 },
  { name: "In Progress", description: "対応中の項目", color: "amber", order: 1 },
  { name: "Done", description: "完了した項目", color: "purple", order: 2 },
];

async function main() {
  for (const column of COLUMNS) {
    const existing = await prisma.column.findFirst({ where: { name: column.name } });
    if (existing) continue;
    await prisma.column.create({ data: column });
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
