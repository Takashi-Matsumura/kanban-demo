import { NextResponse } from "next/server";
import { seedDatabase } from "@/prisma/seedData";

// DB を全削除して当日基準のサンプルデータを再生成する。
export async function POST() {
  try {
    await seedDatabase();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `シードに失敗しました: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
