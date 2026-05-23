import { NextResponse } from "next/server";
import { normalizeVoiceText } from "@/lib/voice-dictionary";

const LLAMA_URL = process.env.LLAMA_URL ?? "http://localhost:8080";
const LLAMA_MODEL = process.env.LLAMA_MODEL ?? "gemma-4-e4b-it-Q4_K_M.gguf";

type ColumnCtx = { id: string; name: string };
type CardCtx = {
  id: string;
  productName: string | null;
  lotCode: string | null;
  columnId: string;
  columnName: string;
  assignee: string | null;
};

type RequestBody = {
  transcript: string;
  context: {
    columns: ColumnCtx[];
    cards: CardCtx[];
  };
};

type LLMOutput = {
  action: "move" | "unknown";
  product_hint: string | null;
  lot_hint: string | null;
  assignee_hint: string | null;
  from_stage_hint: string | null;
  to_stage: string | null;
  direction: "next" | "prev" | null;
};

function buildSystemPrompt(columns: ColumnCtx[]): string {
  const stageList = columns.map((c) => c.name).join("、");
  return [
    "あなたは製パン工場のバッチ管理アシスタントです。",
    `工程は順に: ${stageList}。`,
    "ユーザーの発話を解釈し、以下のJSONを返してください。",
    "厳守: 出力は JSON オブジェクト 1 つのみ。Markdown のコードブロック (```) は使用しない。説明文も不要。",
    "{",
    '  "action": "move" | "unknown",',
    '  "product_hint": "製品名" | null,',
    '  "lot_hint": "ロットコードや日付の手がかり" | null,',
    '  "assignee_hint": "担当者名" | null,',
    '  "from_stage_hint": "現在工程の手がかり" | null,',
    '  "to_stage": "移動先の工程名" | null,',
    '  "direction": "next" | "prev" | null',
    "}",
    "to_stage には必ず上の工程一覧の名前そのものを使うこと。",
    "to_stage と direction はどちらか一方を埋めること。両方 null なら action は unknown。",
  ].join("\n");
}

async function callLLM(transcript: string, columns: ColumnCtx[]): Promise<LLMOutput> {
  const res = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LLAMA_MODEL,
      messages: [
        { role: "system", content: buildSystemPrompt(columns) },
        { role: "user", content: transcript },
      ],
      temperature: 0.1,
      max_tokens: 512,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "{}";
  const jsonText = extractJson(content);
  return JSON.parse(jsonText) as LLMOutput;
}

function extractJson(s: string): string {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end < 0 || end < start) return "{}";
  return s.slice(start, end + 1);
}

function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s.toLowerCase().replace(/\s+/g, "");
}

function scoreCard(card: CardCtx, llm: LLMOutput): number {
  let score = 0;
  const product = normalize(card.productName);
  const lot = normalize(card.lotCode);
  const assignee = normalize(card.assignee);
  const column = normalize(card.columnName);

  if (llm.product_hint && product && product.includes(normalize(llm.product_hint))) score += 10;
  if (llm.lot_hint && lot && lot.includes(normalize(llm.lot_hint))) score += 8;
  if (llm.assignee_hint && assignee && assignee.includes(normalize(llm.assignee_hint))) score += 5;
  if (llm.from_stage_hint && column && column.includes(normalize(llm.from_stage_hint))) score += 3;
  return score;
}

function resolveTargetColumn(
  llm: LLMOutput,
  columns: ColumnCtx[],
  currentColumnId: string,
): { toColumnId: string | null; reason: string } {
  if (llm.to_stage) {
    const t = normalize(llm.to_stage);
    const exact = columns.find((c) => normalize(c.name) === t);
    if (exact) return { toColumnId: exact.id, reason: `指定工程: ${exact.name}` };
    const partial = columns.find((c) => normalize(c.name).includes(t));
    if (partial) return { toColumnId: partial.id, reason: `指定工程(部分一致): ${partial.name}` };
    return { toColumnId: null, reason: `工程「${llm.to_stage}」が見つかりません` };
  }
  if (llm.direction) {
    const idx = columns.findIndex((c) => c.id === currentColumnId);
    if (idx < 0) return { toColumnId: null, reason: "現在工程が不明" };
    const targetIdx = llm.direction === "next" ? idx + 1 : idx - 1;
    if (targetIdx < 0 || targetIdx >= columns.length) {
      return { toColumnId: null, reason: "移動先工程がありません（端）" };
    }
    return { toColumnId: columns[targetIdx].id, reason: `${llm.direction === "next" ? "次" : "前"}工程: ${columns[targetIdx].name}` };
  }
  return { toColumnId: null, reason: "工程の指示なし" };
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
  const columns = body?.context?.columns ?? [];
  const cards = body?.context?.cards ?? [];
  if (columns.length === 0 || cards.length === 0) {
    return NextResponse.json({ ok: false, error: "context is missing" }, { status: 400 });
  }

  const { normalized: normalizedTranscript, applied: replacements } = normalizeVoiceText(rawTranscript);

  let llm: LLMOutput;
  try {
    llm = await callLLM(normalizedTranscript, columns);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: `LLM 呼び出し失敗: ${(e as Error).message}`,
        rawTranscript,
        normalizedTranscript,
        replacements,
      },
      { status: 502 },
    );
  }

  const meta = { rawTranscript, normalizedTranscript, replacements };

  if (llm.action !== "move") {
    return NextResponse.json({ ok: false, error: "操作が解釈できません", llm, ...meta });
  }

  const scored = cards
    .map((c) => ({ card: c, score: scoreCard(c, llm) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "対象バッチが特定できません",
      llm,
      ...meta,
    });
  }

  const topScore = scored[0].score;
  const candidates = scored.filter((x) => x.score === topScore);
  if (candidates.length > 1) {
    return NextResponse.json({
      ok: false,
      error: `候補が複数あります（${candidates.length} 件）`,
      llm,
      candidates: candidates.map((c) => ({
        id: c.card.id,
        productName: c.card.productName,
        columnName: c.card.columnName,
        lotCode: c.card.lotCode,
      })),
      ...meta,
    });
  }

  const targetCard = candidates[0].card;
  const { toColumnId, reason } = resolveTargetColumn(llm, columns, targetCard.columnId);
  if (!toColumnId) {
    return NextResponse.json({ ok: false, error: reason, llm, ...meta });
  }
  if (toColumnId === targetCard.columnId) {
    return NextResponse.json({
      ok: false,
      error: "移動先が現在工程と同じです",
      llm,
      ...meta,
    });
  }

  const targetColumn = columns.find((c) => c.id === toColumnId)!;
  return NextResponse.json({
    ok: true,
    cardId: targetCard.id,
    toColumnId,
    message: `${targetCard.productName ?? "バッチ"}（${targetCard.columnName}）を ${targetColumn.name} へ移動します`,
    llm,
    reason,
    ...meta,
  });
}
