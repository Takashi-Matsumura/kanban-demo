import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeVoiceText } from "@/lib/voice-dictionary";
import { interpretWithJev } from "@/lib/voice/jev";
import { interpretWithLlama } from "@/lib/voice/llama";
import type { CardCtx, ColumnCtx } from "@/lib/voice/types";

type VoiceEngine = "jev" | "llama";

const DEFAULT_VOICE_ENGINE: VoiceEngine = process.env.VOICE_ENGINE === "llama" ? "llama" : "jev";

const AUTO_THRESHOLD = 0.85;
const CONFIRM_THRESHOLD = 0.6;

type RequestBody = { transcript: string; engine?: VoiceEngine };

/**
 * columns/cards はクライアントの context ではなく、ここで DB から直接取得する。
 * クライアント供給の ID を検証なしに信用しないため。
 */
async function loadVoiceState(): Promise<{ columns: ColumnCtx[]; cards: CardCtx[] }> {
  const [columns, cards] = await Promise.all([
    prisma.column.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
    prisma.card.findMany({
      select: {
        id: true,
        title: true,
        lotCode: true,
        columnId: true,
        assignee: true,
        priority: true,
        product: { select: { name: true } },
        column: { select: { name: true } },
      },
    }),
  ]);
  return {
    columns,
    cards: cards.map((c) => ({
      id: c.id,
      title: c.title,
      productName: c.product?.name ?? null,
      lotCode: c.lotCode,
      columnId: c.columnId,
      columnName: c.column.name,
      assignee: c.assignee,
      priority: c.priority,
    })),
  };
}

export async function POST(req: Request) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const rawTranscript = (body?.transcript ?? "").trim();
  if (!rawTranscript) {
    return NextResponse.json({ ok: false, error: "transcript is empty" }, { status: 400 });
  }

  const { columns, cards } = await loadVoiceState();
  if (columns.length === 0 || cards.length === 0) {
    return NextResponse.json({ ok: false, error: "対象データがありません" }, { status: 400 });
  }

  const { normalized: normalizedTranscript, applied: replacements } = normalizeVoiceText(rawTranscript);
  const engine: VoiceEngine = body.engine === "jev" || body.engine === "llama" ? body.engine : DEFAULT_VOICE_ENGINE;
  const meta = { rawTranscript, normalizedTranscript, replacements, engine };

  let result;
  try {
    result =
      engine === "jev"
        ? await interpretWithJev(normalizedTranscript, cards, columns)
        : await interpretWithLlama(normalizedTranscript, cards, columns);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `LLM 呼び出し失敗: ${(e as Error).message}`, ...meta },
      { status: 502 },
    );
  }

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      error: result.error,
      confidence: result.confidence,
      // true: 操作指示ではない発話 / 確信度が低く操作対象と断定できない発話。
      // 常時録音中はどちらも「聞き流してよい」扱いとし、UIでエラー扱いしない。
      ignored: result.notACommand === true,
      ...meta,
    });
  }

  if (result.confidence != null && result.confidence < CONFIRM_THRESHOLD) {
    return NextResponse.json({
      ok: false,
      error: `指示の確信度が低いため実行しませんでした（確信度 ${Math.round(result.confidence * 100)}%）`,
      confidence: result.confidence,
      ignored: true,
      ...meta,
    });
  }

  const targetCard = cards.find((c) => c.id === result.cardId)!;
  const targetColumn = columns.find((c) => c.id === result.toColumnId)!;
  const needsConfirm = result.confidence != null && result.confidence < AUTO_THRESHOLD;

  return NextResponse.json({
    ok: true,
    cardId: result.cardId,
    toColumnId: result.toColumnId,
    needsConfirm,
    confidence: result.confidence,
    message: `${targetCard.productName ?? targetCard.title}（${targetCard.columnName}）を ${targetColumn.name} へ移動します`,
    reason: result.reason,
    ...meta,
  });
}
