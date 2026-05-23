import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 音声コマンド解釈のためにシステムプロンプトに同梱する業務ドキュメント。
 *
 * docs/voice/ 配下の Markdown を起動時に一度読み込んでキャッシュする。
 * 編集後は dev サーバの再起動が必要（プロセス再起動）。
 */

const DOCS = ["process.md", "glossary.md", "examples.md"] as const;

let cached: string | null = null;

export function loadVoiceContext(): string {
  if (cached !== null) return cached;
  const dir = join(process.cwd(), "docs/voice");
  const parts: string[] = [];
  for (const name of DOCS) {
    try {
      const body = readFileSync(join(dir, name), "utf-8").trim();
      parts.push(body);
    } catch {
      // ドキュメントが存在しない場合は静かにスキップ
    }
  }
  cached = parts.join("\n\n---\n\n");
  return cached;
}
