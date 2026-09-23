"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useOpenFit } from "mic-test/openfit";
import { useSpeechSynthesis } from "mic-test/tts";
import { Column } from "./Column";
import { Card } from "./Card";
import { CardDetail } from "./CardDetail";
import { useWhisperRecognition } from "./useWhisperRecognition";
import { useLatestRef } from "./useLatestRef";
import type { BoardColumn, BoardEquipment, BoardProduct } from "@/lib/board";
import { moveCard, voiceMoveCard } from "../actions";

type VoicePhase = "idle" | "recording" | "processing" | "confirm" | "success" | "error";

type VoiceNormalization = {
  raw: string;
  normalized: string;
  replacements: { from: string; to: string }[];
};

type VoicePending = {
  cardId: string;
  toColumnId: string;
};

type VoiceEngine = "jev" | "llama";

type Props = {
  initial: BoardColumn[];
  products: BoardProduct[];
  equipments: BoardEquipment[];
  defaultVoiceEngine: VoiceEngine;
};

const ORDER_STEP = 1024;

export function Board({ initial, products, equipments, defaultVoiceEngine }: Props) {
  const [columns, setColumns] = useState<BoardColumn[]>(initial);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // initial が変わった（= Server Action 後に revalidate された）ら state を同期。
  const prevSigRef = useRef("");
  useEffect(() => {
    const sig = signature(initial);
    if (sig === prevSigRef.current) return;
    prevSigRef.current = sig;
    setColumns(initial);
  }, [initial]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const cardIndex = useMemo(() => {
    const map = new Map<string, { columnId: string; index: number }>();
    columns.forEach((col) => {
      col.cards.forEach((card, index) => {
        map.set(card.id, { columnId: col.id, index });
      });
    });
    return map;
  }, [columns]);

  function handleDragStart(event: DragStartEvent) {
    setActiveCardId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCardId(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const from = cardIndex.get(activeId);
    if (!from) return;

    const overInfo = cardIndex.get(overId);
    const toColumnId = overInfo ? overInfo.columnId : overId;

    const next = columns.map((col) => ({ ...col, cards: [...col.cards] }));
    const fromCol = next.find((c) => c.id === from.columnId);
    const toCol = next.find((c) => c.id === toColumnId);
    if (!fromCol || !toCol) return;

    const [moved] = fromCol.cards.splice(from.index, 1);

    let insertAt: number;
    if (overInfo) {
      // splice 後の index を計算: 同列・同方向(後ろ→前)はそのまま、同列で前→後は -1
      const sameCol = from.columnId === toColumnId;
      insertAt = sameCol && from.index < overInfo.index ? overInfo.index - 1 : overInfo.index;
      insertAt = Math.max(0, Math.min(toCol.cards.length, insertAt));
    } else {
      insertAt = toCol.cards.length;
    }

    toCol.cards.splice(insertAt, 0, { ...moved, columnId: toColumnId });

    const before = toCol.cards[insertAt - 1]?.order ?? null;
    const after = toCol.cards[insertAt + 1]?.order ?? null;
    let newOrder: number;
    if (before != null && after != null) newOrder = (before + after) / 2;
    else if (before != null) newOrder = before + ORDER_STEP;
    else if (after != null) newOrder = after - ORDER_STEP;
    else newOrder = ORDER_STEP;
    toCol.cards[insertAt] = { ...toCol.cards[insertAt], order: newOrder };

    setColumns(next);

    startTransition(async () => {
      try {
        await moveCard({
          cardId: activeId,
          toColumnId,
          orderBefore: before,
          orderAfter: after,
        });
      } catch {
        setColumns(initial);
      }
    });
  }

  const allCards = useMemo(() => columns.flatMap((c) => c.cards), [columns]);
  const activeCard = activeCardId ? allCards.find((c) => c.id === activeCardId) : null;
  // open 中のカードが削除された場合、find が undefined を返すのでパネルは描画されない。
  // openCardId 自体は残るが副作用なし（cuid なので衝突しない）。
  const openCard = openCardId ? allCards.find((c) => c.id === openCardId) : null;

  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [voiceNormalization, setVoiceNormalization] = useState<VoiceNormalization | null>(null);
  const [voicePending, setVoicePending] = useState<VoicePending | null>(null);
  const [voiceConfidence, setVoiceConfidence] = useState<number | null>(null);
  const [voiceLastEngine, setVoiceLastEngine] = useState<string | null>(null);
  // 音声操作デモパネルで選べるエンジン。既定値はサーバの VOICE_ENGINE 環境変数から。
  const [voiceEngineChoice, setVoiceEngineChoice] = useState<VoiceEngine>(defaultVoiceEngine);
  const voiceEngineChoiceRef = useLatestRef(voiceEngineChoice);
  const voicePhaseRef = useLatestRef(voicePhase);
  const voicePendingRef = useLatestRef(voicePending);

  const tts = useSpeechSynthesis({ lang: "ja-JP" });
  const ttsSpeakRef = useLatestRef(tts.speak);
  const ttsSupportedRef = useLatestRef(tts.isSupported);

  const handleTranscript = useCallback(async (text: string) => {
    setVoicePhase("processing");
    setVoiceMessage(null);
    setVoiceNormalization(null);
    setVoicePending(null);
    setVoiceConfidence(null);
    try {
      const res = await fetch("/api/voice-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, engine: voiceEngineChoiceRef.current }),
      });
      const data = await res.json();
      if (data.rawTranscript || data.normalizedTranscript) {
        setVoiceNormalization({
          raw: data.rawTranscript ?? text,
          normalized: data.normalizedTranscript ?? text,
          replacements: data.replacements ?? [],
        });
      }
      setVoiceConfidence(typeof data.confidence === "number" ? data.confidence : null);
      setVoiceLastEngine(typeof data.engine === "string" ? data.engine : null);
      if (!data.ok) {
        setVoicePhase("error");
        const msg = data.error ?? "指示を解釈できませんでした";
        setVoiceMessage(msg);
        if (ttsSupportedRef.current) ttsSpeakRef.current(msg);
        return;
      }
      if (data.needsConfirm) {
        setVoicePending({ cardId: data.cardId, toColumnId: data.toColumnId });
        setVoicePhase("confirm");
        const confPct = typeof data.confidence === "number" ? `（確信度 ${Math.round(data.confidence * 100)}%）` : "";
        const msg = `${data.message}${confPct} よろしいですか？`;
        setVoiceMessage(msg);
        if (ttsSupportedRef.current) ttsSpeakRef.current(msg);
        return;
      }
      await voiceMoveCard(data.cardId, data.toColumnId);
      setVoicePhase("success");
      setVoiceMessage(data.message);
      if (ttsSupportedRef.current) ttsSpeakRef.current(data.message);
    } catch (e) {
      setVoicePhase("error");
      const msg = `通信エラー: ${(e as Error).message}`;
      setVoiceMessage(msg);
      if (ttsSupportedRef.current) ttsSpeakRef.current(msg);
    }
  }, [voiceEngineChoiceRef, ttsSpeakRef, ttsSupportedRef]);

  const confirmVoiceMove = useCallback(async () => {
    const pending = voicePendingRef.current;
    if (!pending) return;
    setVoicePhase("processing");
    try {
      await voiceMoveCard(pending.cardId, pending.toColumnId);
      setVoicePhase("success");
      const msg = "実行しました";
      setVoiceMessage(msg);
      if (ttsSupportedRef.current) ttsSpeakRef.current(msg);
    } catch (e) {
      setVoicePhase("error");
      const msg = `実行エラー: ${(e as Error).message}`;
      setVoiceMessage(msg);
      if (ttsSupportedRef.current) ttsSpeakRef.current(msg);
    } finally {
      setVoicePending(null);
    }
  }, [voicePendingRef, ttsSpeakRef, ttsSupportedRef]);

  const cancelVoiceMove = useCallback(() => {
    setVoicePending(null);
    setVoicePhase("idle");
    const msg = "取消しました";
    setVoiceMessage(msg);
    if (ttsSupportedRef.current) ttsSpeakRef.current(msg);
  }, [ttsSpeakRef, ttsSupportedRef]);

  const confirmVoiceMoveRef = useLatestRef(confirmVoiceMove);
  const cancelVoiceMoveRef = useLatestRef(cancelVoiceMove);

  const speech = useWhisperRecognition({ lang: "ja", onFinal: handleTranscript });
  const speechStartRef = useLatestRef(speech.start);
  const speechStopRef = useLatestRef(speech.stop);
  const speechResetRef = useLatestRef(speech.reset);
  const isListeningRef = useLatestRef(speech.isListening);

  // 音声操作デモは既定で閉じておき、本来の工程詳細（カンバン）を主役にする。
  // BT リモートや録音開始で呼び出された時だけ自動展開し、フィードバックを見せる。
  const [voiceDemoOpen, setVoiceDemoOpen] = useState(false);

  const toggleVoice = useCallback(() => {
    if (isListeningRef.current) {
      speechStopRef.current();
    } else {
      setVoicePhase("recording");
      setVoiceMessage(null);
      setVoiceNormalization(null);
      setVoiceDemoOpen(true);
      speechStartRef.current();
    }
  }, [isListeningRef, speechStartRef, speechStopRef]);

  const resetVoice = useCallback(() => {
    if (isListeningRef.current) speechStopRef.current();
    speechResetRef.current();
    setVoicePhase("idle");
    setVoiceMessage(null);
    setVoiceNormalization(null);
  }, [isListeningRef, speechStopRef, speechResetRef]);

  // 確認待ち（needsConfirm）のときは BT イヤホンのボタンを 実行/取消 に割り当てる。
  // マウスを使わずに操作できるようにするため。
  const handleBtPlayPause = useCallback(() => {
    if (voicePhaseRef.current === "confirm") {
      confirmVoiceMoveRef.current();
    } else {
      toggleVoice();
    }
  }, [toggleVoice, voicePhaseRef, confirmVoiceMoveRef]);

  const handleBtNext = useCallback(() => {
    if (voicePhaseRef.current === "confirm") {
      cancelVoiceMoveRef.current();
    } else {
      resetVoice();
    }
  }, [resetVoice, voicePhaseRef, cancelVoiceMoveRef]);

  const openfit = useOpenFit({
    metadata: { title: "製パンライン カンバン" },
    onPlayPause: handleBtPlayPause,
    onNext: handleBtNext,
  });

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <VoiceDemoWidget
        open={voiceDemoOpen}
        onOpenChange={setVoiceDemoOpen}
        isListening={speech.isListening}
      >
        <VoiceCommandBar
          btSupported={openfit.isSupported}
          btEnabled={openfit.enabled}
          onBtEnable={openfit.enable}
          onBtDisable={openfit.disable}
          btError={openfit.error}
          speechSupported={speech.isSupported}
          isListening={speech.isListening}
          interim={speech.interim}
          finalText={speech.finalText}
          speechError={speech.error}
          phase={voicePhase}
          message={voiceMessage}
          normalization={voiceNormalization}
          confidence={voiceConfidence}
          lastEngine={voiceLastEngine}
          engineChoice={voiceEngineChoice}
          onEngineChoiceChange={setVoiceEngineChoice}
          pending={voicePending}
          onToggleVoice={toggleVoice}
          onReset={resetVoice}
          onConfirm={confirmVoiceMove}
          onCancel={cancelVoiceMove}
        />
      </VoiceDemoWidget>
      <DndContext
        id="kanban-board"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex items-stretch gap-2 overflow-x-auto pb-4">
          {columns.map((column, i) => (
            <Fragment key={column.id}>
              <Column
                column={column}
                products={products}
                onOpenCard={setOpenCardId}
                index={i}
                total={columns.length}
              />
              {i < columns.length - 1 ? <FlowArrow /> : null}
            </Fragment>
          ))}
        </div>
        <DragOverlay>{activeCard ? <Card card={activeCard} dragging /> : null}</DragOverlay>
      </DndContext>
      {openCard ? (
        <CardDetail
          key={openCard.id}
          card={openCard}
          columns={columns}
          stageType={columns.find((c) => c.id === openCard.columnId)?.stageType ?? null}
          equipments={equipments}
          onClose={() => setOpenCardId(null)}
        />
      ) : null}
    </div>
  );
}

function VoiceDemoWidget({
  open,
  onOpenChange,
  isListening,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isListening: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      {open ? (
        <div className="fixed bottom-24 right-6 z-[60] max-h-[75vh] w-[380px] overflow-y-auto rounded-xl border border-violet-300 bg-white shadow-2xl">
          <div className="flex items-center justify-between gap-2 rounded-t-xl border-b border-violet-200 bg-violet-50 px-3 py-2">
            <span className="flex items-center gap-2 text-xs font-semibold text-violet-800">
              <span className="rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                DEMO
              </span>
              音声操作デモ
            </span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="音声操作デモを閉じる"
              className="rounded px-1 text-violet-500 hover:bg-violet-100 hover:text-violet-800"
            >
              ✕
            </button>
          </div>
          <div className="p-3">
            <p className="mb-2 text-[11px] leading-snug text-violet-600">
              声で工程を移動できる体験機能です。本来の工程詳細（下のカンバン）とは別の実験的な操作パネルです。
            </p>
            {children}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className={`fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold shadow-lg transition ${
          open
            ? "bg-violet-600 text-white hover:bg-violet-700"
            : "border border-violet-300 bg-white text-violet-700 hover:bg-violet-50"
        }`}
      >
        {!open ? (
          <span className="rounded bg-violet-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
            DEMO
          </span>
        ) : null}
        <span>{open ? "✕ 閉じる" : "🎤 音声操作デモ"}</span>
        {isListening ? (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
        ) : null}
      </button>
    </>
  );
}

function VoiceCommandBar({
  btSupported,
  btEnabled,
  onBtEnable,
  onBtDisable,
  btError,
  speechSupported,
  isListening,
  interim,
  finalText,
  speechError,
  phase,
  message,
  normalization,
  confidence,
  lastEngine,
  engineChoice,
  onEngineChoiceChange,
  pending,
  onToggleVoice,
  onReset,
  onConfirm,
  onCancel,
}: {
  btSupported: boolean;
  btEnabled: boolean;
  onBtEnable: () => void;
  onBtDisable: () => void;
  btError: Error | null;
  speechSupported: boolean;
  isListening: boolean;
  interim: string;
  finalText: string;
  speechError: string | null;
  phase: VoicePhase;
  message: string | null;
  normalization: VoiceNormalization | null;
  confidence: number | null;
  lastEngine: string | null;
  engineChoice: VoiceEngine;
  onEngineChoiceChange: (engine: VoiceEngine) => void;
  pending: VoicePending | null;
  onToggleVoice: () => void;
  onReset: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const phaseLabel: Record<VoicePhase, string> = {
    idle: "待機中",
    recording: "● 録音中",
    processing: "解析中...",
    confirm: "確認待ち",
    success: "✓ 実行完了",
    error: "✕ エラー",
  };
  const phaseClass: Record<VoicePhase, string> = {
    idle: "bg-zinc-100 text-zinc-700",
    recording: "bg-red-100 text-red-700 animate-pulse",
    processing: "bg-amber-100 text-amber-700",
    confirm: "bg-blue-100 text-blue-700",
    success: "bg-emerald-100 text-emerald-700",
    error: "bg-red-100 text-red-700",
  };
  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {btSupported ? (
          <button
            type="button"
            onClick={btEnabled ? onBtDisable : onBtEnable}
            className={`rounded px-3 py-1 font-medium ${
              btEnabled
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100"
            }`}
          >
            {btEnabled ? "BT 連携: ON" : "BT 連携を有効化"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onToggleVoice}
          disabled={!speechSupported}
          className={`rounded px-3 py-1 font-medium ${
            isListening
              ? "bg-red-600 text-white hover:bg-red-700"
              : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 disabled:opacity-50"
          }`}
        >
          {isListening ? "■ 録音停止" : "🎤 音声入力 開始"}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded border border-zinc-300 bg-white px-3 py-1 text-zinc-700 hover:bg-zinc-100"
        >
          ↺ リセット
        </button>
        <span className={`rounded px-2 py-0.5 font-mono text-[11px] ${phaseClass[phase]}`}>
          {phaseLabel[phase]}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          解釈
          <div className="flex items-center overflow-hidden rounded border border-zinc-300">
            {(["jev", "llama"] as const).map((eng) => (
              <button
                key={eng}
                type="button"
                onClick={() => onEngineChoiceChange(eng)}
                aria-pressed={engineChoice === eng}
                className={`px-2 py-1 text-[11px] font-medium ${
                  engineChoice === eng
                    ? "bg-violet-600 text-white"
                    : "bg-white text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {eng === "jev" ? "Jev" : "llama"}
              </button>
            ))}
          </div>
        </label>
        {lastEngine ? (
          <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-[10px] text-zinc-500">
            前回: {lastEngine === "jev" ? "Jev" : "llama"}
            {confidence != null ? ` ${Math.round(confidence * 100)}%` : ""}
          </span>
        ) : null}
      </div>
      <p className="text-[11px] leading-snug text-zinc-500">
        {btEnabled
          ? phase === "confirm"
            ? "BT: シングル→実行, ダブル→取消。"
            : "BT: シングル→録音 ON/OFF, ダブル→リセット。"
          : ""}
        発話例: 「フランスパンを成形へ」「角食パンを次へ」
      </p>

      {phase === "confirm" && pending ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="rounded bg-blue-600 px-3 py-1 font-medium text-white hover:bg-blue-700"
          >
            ✓ 実行
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-zinc-300 bg-white px-3 py-1 font-medium text-zinc-800 hover:bg-zinc-100"
          >
            ✕ 取消
          </button>
        </div>
      ) : null}

      {isListening || interim || finalText ? (
        <div className="rounded border border-zinc-200 bg-white px-2 py-1">
          <span className="text-[10px] uppercase tracking-wide text-zinc-400">認識テキスト</span>
          <p className="font-mono text-sm text-zinc-900">
            {finalText}
            <span className="text-zinc-400">{interim}</span>
            {isListening && !finalText && !interim ? <span className="text-zinc-400">話してください...</span> : null}
          </p>
        </div>
      ) : null}

      {normalization && normalization.replacements.length > 0 ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1">
          <span className="text-[10px] uppercase tracking-wide text-amber-700">
            辞書で正規化（同音異義語の補正）
          </span>
          <p className="font-mono text-sm text-amber-900">{normalization.normalized}</p>
          <p className="mt-0.5 text-[11px] text-amber-700">
            {normalization.replacements.map((r, i) => (
              <span key={i} className="mr-2">
                <span className="line-through">{r.from}</span> → <span className="font-semibold">{r.to}</span>
              </span>
            ))}
          </p>
        </div>
      ) : null}

      {message ? (
        <div
          className={`rounded border px-2 py-1 text-sm ${
            phase === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : phase === "error"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-zinc-200 bg-white text-zinc-700"
          }`}
        >
          {message}
        </div>
      ) : null}

      {!speechSupported ? (
        <span className="text-[11px] text-red-700">
          このブラウザは Web Speech API に未対応です（Chrome / Safari を推奨）
        </span>
      ) : null}
      {speechError ? <span className="text-[11px] text-red-700">{speechError}</span> : null}
      {btError ? <span className="text-[11px] text-red-700">BT: {btError.message}</span> : null}
    </div>
  );
}

function FlowArrow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none flex shrink-0 items-center pt-10 text-zinc-300"
    >
      ▶
    </div>
  );
}

function signature(columns: BoardColumn[]) {
  return columns
    .map((col) =>
      [
        col.id,
        col.cards
          .map((c) => [c.id, c.order, c.columnId, c.title, c.description, c.updatedAt])
          .flat(),
      ].join(":")
    )
    .join("|");
}
