"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLatestRef } from "./useLatestRef";

export type TranscriptionHook = {
  isSupported: boolean;
  /** マイクセッションが有効か（常時録音中かどうか） */
  isListening: boolean;
  /** 発話区間を検出し、現在の発話を録音中か（VAD） */
  isSpeaking: boolean;
  /** 直近に文字起こしされた発話（UI表示用） */
  lastText: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
};

type Options = {
  lang?: string;
  /** 発話区間が確定するたびに呼ばれる（1セッション中に複数回発火する） */
  onUtterance?: (text: string) => void;
};

const CANDIDATE_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return CANDIDATE_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

// 音量ベースの簡易VAD（Voice Activity Detection）のしきい値。
// 工場内の環境音レベルによって調整が必要になる場合がある。
const RMS_THRESHOLD = 0.02;
const SILENCE_HANGOVER_MS = 900;
const MIN_UTTERANCE_MS = 350;
const MAX_UTTERANCE_MS = 15000;

/**
 * サーバの whisper-server（whisper.cpp、要 --convert）にマイク音声を送って文字起こしする。
 * 常時マイクを開いたまま音量ベースのVADで発話区間を自動検出し、無音が
 * SILENCE_HANGOVER_MS 続いたところで発話区間を確定・文字起こしして
 * onUtterance を発火する。工場内でボタン操作を都度行わずに済むようにするため。
 */
export function useWhisperRecognition(options: Options = {}): TranscriptionHook {
  const { lang = "ja", onUtterance } = options;
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastText, setLastText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const onUtteranceRef = useLatestRef(onUtterance);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadBufRef = useRef<Float32Array | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speechStartAtRef = useRef<number | null>(null);
  const lastAboveThresholdAtRef = useRef<number>(0);
  const stoppingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = setTimeout(() => {
      setIsSupported(
        !!(navigator.mediaDevices && typeof MediaRecorder !== "undefined" && typeof AudioContext !== "undefined"),
      );
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const cleanupAll = useCallback(() => {
    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        /* noop */
      }
    }
    recorderRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    speechStartAtRef.current = null;
  }, []);

  const finalizeUtterance = useCallback(() => {
    const recorder = recorderRef.current;
    const startedAt = speechStartAtRef.current;
    recorderRef.current = null;
    speechStartAtRef.current = null;
    setIsSpeaking(false);
    if (!recorder || startedAt == null) return;
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_UTTERANCE_MS) {
      // 短すぎる区間（雑音のスパイク等）は破棄
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
      chunksRef.current = [];
      return;
    }
    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      chunksRef.current = [];
      if (stoppingRef.current || blob.size === 0) return;
      try {
        const form = new FormData();
        form.append("file", blob, "voice.webm");
        form.append("language", lang);
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        const data = await res.json();
        if (!data.ok) {
          setError(data.error ?? "文字起こしに失敗しました");
          return;
        }
        const text: string = (data.text ?? "").trim();
        if (!text) return;
        setLastText(text);
        onUtteranceRef.current?.(text);
      } catch (e) {
        setError(`文字起こしエラー: ${(e as Error).message}`);
      }
    };
    if (recorder.state !== "inactive") recorder.stop();
  }, [lang, onUtteranceRef]);

  const beginUtterance = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mimeType = pickMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorderRef.current = recorder;
    speechStartAtRef.current = Date.now();
    setIsSpeaking(true);
    recorder.start();
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices || typeof MediaRecorder === "undefined" || typeof AudioContext === "undefined") {
      setError("このブラウザは音声録音に対応していません");
      return;
    }
    setError(null);
    setLastText("");
    stoppingRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
      vadBufRef.current = new Float32Array(analyser.fftSize);
      lastAboveThresholdAtRef.current = 0;

      // requestAnimationFrame での自己再帰は useCallback の記憶より前に参照できないため、
      // ループはローカル関数として定義する（beginUtterance/finalizeUtterance は
      // 安定した参照を持つ useCallback なので、このクロージャ内で直接呼んでよい）。
      const tick = () => {
        const buf = vadBufRef.current;
        if (!analyserRef.current || !buf) return;
        analyserRef.current.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        const now = Date.now();

        if (rms > RMS_THRESHOLD) {
          lastAboveThresholdAtRef.current = now;
          if (!recorderRef.current) beginUtterance();
          else if (speechStartAtRef.current != null && now - speechStartAtRef.current > MAX_UTTERANCE_MS) {
            // 長時間しゃべり続けている場合は一旦区切って次の区間として録音し直す
            finalizeUtterance();
            beginUtterance();
          }
        } else if (recorderRef.current && now - lastAboveThresholdAtRef.current > SILENCE_HANGOVER_MS) {
          finalizeUtterance();
        }

        rafIdRef.current = requestAnimationFrame(tick);
      };

      setIsListening(true);
      rafIdRef.current = requestAnimationFrame(tick);
    } catch (e) {
      setError(`マイクを開始できません: ${(e as Error).message}`);
      cleanupAll();
      setIsListening(false);
    }
  }, [beginUtterance, finalizeUtterance, cleanupAll]);

  const stop = useCallback(() => {
    stoppingRef.current = true;
    cleanupAll();
    setIsListening(false);
    setIsSpeaking(false);
  }, [cleanupAll]);

  const reset = useCallback(() => {
    setLastText("");
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      stoppingRef.current = true;
      cleanupAll();
    };
  }, [cleanupAll]);

  return { isSupported, isListening, isSpeaking, lastText, error, start, stop, reset };
}
