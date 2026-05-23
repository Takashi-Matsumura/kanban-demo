"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Web Speech API の型 (グローバル window への拡張)
type RecognitionResult = {
  isFinal: boolean;
  0: { transcript: string };
};
type RecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
};
type RecognitionErrorEvent = { error: string };
type RecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionCtor = new () => RecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  }
}

export type SpeechRecognitionHook = {
  isSupported: boolean;
  isListening: boolean;
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

export function useSpeechRecognition(options: Options = {}): SpeechRecognitionHook {
  const { lang = "ja-JP", onFinal } = options;
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [finalText, setFinalText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const recRef = useRef<RecognitionInstance | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const finalAccRef = useRef("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setIsSupported(!!Ctor);
  }, []);

  const start = useCallback(() => {
    if (typeof window === "undefined") return;
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setError("このブラウザは音声認識に対応していません");
      return;
    }
    if (recRef.current) {
      try { recRef.current.abort(); } catch { /* noop */ }
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;
    finalAccRef.current = "";
    setInterim("");
    setFinalText("");
    setError(null);

    rec.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0].transcript;
        if (r.isFinal) {
          finalAccRef.current += t;
        } else {
          interimText += t;
        }
      }
      setInterim(interimText);
      setFinalText(finalAccRef.current);
    };
    rec.onerror = (e) => {
      setError(`音声認識エラー: ${e.error}`);
    };
    rec.onend = () => {
      setIsListening(false);
      const txt = finalAccRef.current.trim();
      if (txt) onFinalRef.current?.(txt);
    };
    recRef.current = rec;
    try {
      rec.start();
      setIsListening(true);
    } catch (e) {
      setError(`音声認識を開始できません: ${(e as Error).message}`);
    }
  }, [lang]);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    setInterim("");
    setFinalText("");
    setError(null);
    finalAccRef.current = "";
  }, []);

  useEffect(() => {
    return () => {
      recRef.current?.abort();
    };
  }, []);

  return { isSupported, isListening, interim, finalText, error, start, stop, reset };
}
