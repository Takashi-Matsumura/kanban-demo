import { TypeSafeClient, choice } from "@typesafe-ai/sdk";
import type { CardCtx, ColumnCtx, VoiceEngineResult } from "./types";

const MODEL = "jev-latest";
const TIMEOUT_MS = 5000;

const NEXT = "__next__";
const PREV = "__prev__";

let client: TypeSafeClient | null = null;
function getClient(): TypeSafeClient {
  client ??= new TypeSafeClient();
  return client;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function cardCriteria(cards: CardCtx[]): Record<string, string> {
  return Object.fromEntries(
    cards.map((c) => [
      c.id,
      `${c.productName ?? c.title} / ロット: ${c.lotCode ?? "不明"} / 現在工程: ${c.columnName} / 担当: ${
        c.assignee ?? "未設定"
      } / 優先度: ${c.priority}`,
    ]),
  );
}

function targetCriteria(columns: ColumnCtx[]): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const c of columns) entries[c.name] = `工程「${c.name}」を明示的に指定している`;
  entries[NEXT] = "現在の工程から「次へ」「進めて」など、次の工程へ進める指示";
  entries[PREV] = "現在の工程から「戻して」「前へ」など、前の工程へ戻す指示";
  return entries;
}

/**
 * Jev の state には無関係な情報が多いと精度が落ちるため（model-jaggedness/jev-1.13）、
 * 発話と工程順のみを渡す。
 */
export async function interpretWithJev(
  transcript: string,
  cards: CardCtx[],
  columns: ColumnCtx[],
): Promise<VoiceEngineResult> {
  const res = await withTimeout(
    getClient().systemOne({
      model: MODEL,
      state: { 発話: transcript, 工程順: columns.map((c) => c.name).join(" → ") },
      questions: {
        intent: choice("ユーザーの発話は、バッチを別の工程へ移動する指示か？", {
          move: "バッチ・製品を工程間で移動させる指示",
          other: "それ以外（質問・雑談・無関係な発話など）",
        }),
        card: choice("この発話はどのバッチについて言っているか？", cardCriteria(cards)),
        target: choice("移動先の工程、または方向はどれか？", targetCriteria(columns)),
      },
    }),
    TIMEOUT_MS,
  );

  const { intent, card, target } = res.answers;
  // 全体の確信度は各質問の確信度の最小値とする（一番弱い判断が全体の確信度を決める）
  const confidence = Math.min(intent.confidence, card.confidence, target.confidence);

  if (intent.choice !== "move") {
    return {
      ok: false,
      error: "操作の指示として解釈できませんでした",
      confidence: intent.confidence,
      notACommand: true,
      debug: { intent, card, target },
    };
  }

  const targetCard = cards.find((c) => c.id === card.choice);
  if (!targetCard) {
    return { ok: false, error: "対象バッチが特定できません", confidence, debug: { intent, card, target } };
  }

  let toColumnId: string;
  let reason: string;
  if (target.choice === NEXT || target.choice === PREV) {
    const idx = columns.findIndex((c) => c.id === targetCard.columnId);
    const targetIdx = target.choice === NEXT ? idx + 1 : idx - 1;
    if (idx < 0 || targetIdx < 0 || targetIdx >= columns.length) {
      return { ok: false, error: "移動先工程がありません（端）", confidence, debug: { intent, card, target } };
    }
    toColumnId = columns[targetIdx].id;
    reason = `${target.choice === NEXT ? "次" : "前"}工程: ${columns[targetIdx].name}`;
  } else {
    const col = columns.find((c) => c.name === target.choice);
    if (!col) {
      return { ok: false, error: `工程「${target.choice}」が見つかりません`, confidence, debug: { intent, card, target } };
    }
    toColumnId = col.id;
    reason = `指定工程: ${col.name}`;
  }

  if (toColumnId === targetCard.columnId) {
    return { ok: false, error: "移動先が現在工程と同じです", confidence, debug: { intent, card, target } };
  }

  return { ok: true, cardId: targetCard.id, toColumnId, confidence, reason, debug: { intent, card, target } };
}
