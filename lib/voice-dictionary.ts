/**
 * 音声認識テキストの正規化辞書
 *
 * Web Speech API による日本語音声認識は同音異義語の誤変換が発生しやすい。
 * 工場の語彙に合わせて明示的に置換ルールを定義する。
 *
 * 置換は単純な文字列マッチで行われるため、誤爆を避けるには
 * 前後の文字も含めた長めのキーにすること（例:「砂糖」単独ではなく「砂糖さん」のような形）
 * を検討する。現状は短いキーで運用し、必要に応じて文脈付きキーを追加する。
 */

export type ReplacementCategory = "stage" | "person" | "product";

export type Replacement = {
  from: string;
  to: string;
  category: ReplacementCategory;
  note?: string;
};

export const VOICE_REPLACEMENTS: Replacement[] = [
  // 工程名（パン製造）
  { from: "整形", to: "成形", category: "stage" },
  { from: "整型", to: "成形", category: "stage" },
  { from: "正型", to: "成形", category: "stage" },
  { from: "聖型", to: "成形", category: "stage" },
  { from: "製形", to: "成形", category: "stage" },
  { from: "招請", to: "焼成", category: "stage" },
  { from: "上製", to: "焼成", category: "stage" },
  { from: "傷性", to: "焼成", category: "stage" },
  { from: "笑声", to: "焼成", category: "stage" },
  { from: "放送", to: "包装", category: "stage" },
  { from: "奉仕", to: "包装", category: "stage" },
  { from: "報奨", to: "包装", category: "stage" },
  { from: "県警", to: "検品", category: "stage" },
  { from: "健品", to: "検品", category: "stage" },
  { from: "出火", to: "出荷", category: "stage" },
  { from: "宿下", to: "出荷", category: "stage" },
  { from: "礼客", to: "冷却", category: "stage" },
  { from: "霊客", to: "冷却", category: "stage" },
  { from: "市子", to: "仕込", category: "stage" },
  { from: "仕事込み", to: "仕込", category: "stage" },
  { from: "ベンチタイマー", to: "ベンチタイム", category: "stage" },

  // 担当者名（汎用的なもののみ。実際の担当者名は運用に合わせて追加）
  { from: "砂糖さん", to: "佐藤さん", category: "person" },
  { from: "左藤", to: "佐藤", category: "person" },
  { from: "佐東", to: "佐藤", category: "person" },
  { from: "棚かさん", to: "田中さん", category: "person" },

  // 製品名
  { from: "各色パン", to: "角食パン", category: "product" },
  { from: "書く食パン", to: "角食パン", category: "product" },
  { from: "画食パン", to: "角食パン", category: "product" },
  { from: "メロンパン", to: "メロンパン", category: "product" }, // identity（記述用）
];

export type NormalizeResult = {
  normalized: string;
  applied: Replacement[];
};

export function normalizeVoiceText(text: string): NormalizeResult {
  let out = text;
  const applied: Replacement[] = [];
  for (const r of VOICE_REPLACEMENTS) {
    if (r.from === r.to) continue;
    if (out.includes(r.from)) {
      out = out.split(r.from).join(r.to);
      applied.push(r);
    }
  }
  return { normalized: out, applied };
}

/**
 * LLM プロンプトに含める、よくある誤変換の注意書きを生成する。
 * 辞書を膨らませてもプロンプトが肥大化しすぎないよう、stage カテゴリのみに絞る。
 */
export function buildLLMDictionaryHint(): string {
  const stageReplacements = VOICE_REPLACEMENTS.filter((r) => r.category === "stage" && r.from !== r.to);
  if (stageReplacements.length === 0) return "";
  const lines = stageReplacements.map((r) => `${r.from} → ${r.to}`);
  return [
    "以下は音声認識で起こりやすい誤変換です。文脈上、製パン工程として解釈すべきところは右側を採用してください。",
    ...lines,
  ].join("\n");
}
