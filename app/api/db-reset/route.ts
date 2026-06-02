import { NextResponse } from "next/server";
import { seedDatabase } from "@/prisma/seedData";

// DB を全削除して当日基準のサンプルデータを再生成する。
// 破壊的操作のため、本番環境では明示的に許可しない限り無効。
export async function POST() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_DB_RESET !== "true"
  ) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
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
