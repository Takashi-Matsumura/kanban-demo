"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLatestRef } from "./useLatestRef";

export type TranscriptionHook = {
  isSupported: boolean;
  isListening: boolean;
  /** Whisper はまとめて文字起こしするため常に空文字（逐次の途中結果は無い） */
  interim: string;
  finalText: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
};

type Options = {
  lang?: string;
  onFinal?: (text: string) => void;
};

const CANDIDATE_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return CANDIDATE_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

/**
 * サーバの whisper-server（whisper.cpp、要 --convert）にマイク音声を送って文字起こしする。
 * 逐次の interim 結果は無く、録音停止後にまとめて届く（isListening は
 * 録音停止〜文字起こし完了まで true のままにして呼び出し側の状態遷移を単純に保つ）。
 */
export function useWhisperRecognition(options: Options = {}): TranscriptionHook {
  const { lang = "ja", onFinal } = options;
  const [isListening, setIsListening] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const onFinalRef = useLatestRef(onFinal);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = setTimeout(() => {
      setIsSupported(!!(navigator.mediaDevices && typeof MediaRecorder !== "undefined"));
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") {
      setError("このブラウザは音声録音に対応していません");
      return;
    }
    setError(null);
    setFinalText("");
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        cleanupStream();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        if (blob.size === 0) {
          setIsListening(false);
          return;
        }
        try {
          const form = new FormData();
          form.append("file", blob, "voice.webm");
          form.append("language", lang);
          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          const data = await res.json();
          if (!data.ok) {
            setError(data.error ?? "文字起こしに失敗しました");
            setIsListening(false);
            return;
          }
          const text: string = (data.text ?? "").trim();
          setFinalText(text);
          setIsListening(false);
          if (text) onFinalRef.current?.(text);
        } catch (e) {
          setError(`文字起こしエラー: ${(e as Error).message}`);
          setIsListening(false);
        }
      };

      recorderRef.current = recorder;
      recorder.start();
      setIsListening(true);
    } catch (e) {
      setError(`マイクを開始できません: ${(e as Error).message}`);
      cleanupStream();
    }
  }, [lang, cleanupStream, onFinalRef]);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  const reset = useCallback(() => {
    setFinalText("");
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      cleanupStream();
    };
  }, [cleanupStream]);

  return { isSupported, isListening, interim: "", finalText, error, start, stop, reset };
}
