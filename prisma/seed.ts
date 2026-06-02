import { prisma } from "../lib/prisma";
import { seedDatabase } from "./seedData";

// CLI エントリ: `npm run db:seed` (tsx prisma/seed.ts) から実行される。
seedDatabase()
  .then(async () => {
    console.log("Seed completed.");
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
