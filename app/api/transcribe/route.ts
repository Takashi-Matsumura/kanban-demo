import { NextResponse } from "next/server";

const WHISPER_URL = process.env.WHISPER_URL ?? "http://localhost:8090";
const TIMEOUT_MS = 30000;

export async function POST(req: Request) {
  let incoming: FormData;
  try {
    incoming = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid form data" }, { status: 400 });
  }

  const file = incoming.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "音声データがありません" }, { status: 400 });
  }
  const language = typeof incoming.get("language") === "string" ? String(incoming.get("language")) : "ja";

  const forward = new FormData();
  forward.append("file", file, "voice.webm");
  forward.append("response_format", "json");
  forward.append("language", language);

  let res: Response;
  try {
    res = await fetch(`${WHISPER_URL}/inference`, {
      method: "POST",
      body: forward,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Whisper 呼び出し失敗: ${(e as Error).message}` },
      { status: 502 },
    );
  }
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: `Whisper HTTP ${res.status}` }, { status: 502 });
  }

  const data = await res.json();
  const text = typeof data?.text === "string" ? data.text.trim() : "";
  return NextResponse.json({ ok: true, text });
}
