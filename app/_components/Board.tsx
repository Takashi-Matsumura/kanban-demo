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

type VoicePhase = "idle" | "recording" | "processing" | "confirm" | "success" | "ignored" | "error";

type VoiceNormalization = {
  raw: string;
  normalized: string;
  replacements: { from: string; to: string }[];
};

type VoicePending = {
  cardId: string;
  toColumnId: string;
};

type Props = {
  initial: BoardColumn[];
  products: BoardProduct[];
  equipments: BoardEquipment[];
};

const ORDER_STEP = 1024;

export function Board({ initial, products, equipments }: Props) {
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
  const voicePhaseRef = useLatestRef(voicePhase);
  const voicePendingRef = useLatestRef(voicePending);

  // 発話ごとの処理が終わったあと、しばらくしたら自動的に「聞いています」状態へ戻す。
  // 常時録音中は毎回ボタンを押し直させないため。idle（セッション停止）や
  // confirm（確認待ち）のときは上書きしない。
  const returnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReturnToListening = useCallback(
    (delayMs: number) => {
      if (returnTimerRef.current) clearTimeout(returnTimerRef.current);
      returnTimerRef.current = setTimeout(() => {
        returnTimerRef.current = null;
        if (voicePhaseRef.current === "idle" || voicePhaseRef.current === "confirm") return;
        setVoicePhase("recording");
        setVoiceMessage(null);
      }, delayMs);
    },
    [voicePhaseRef],
  );

  const tts = useSpeechSynthesis({ lang: "ja-JP" });
  const ttsSpeakRef = useLatestRef(tts.speak);
  const ttsSupportedRef = useLatestRef(tts.isSupported);

  const handleTranscript = useCallback(async (text: string) => {
    // 処理中・確認待ちの間に検出された発話は無視する（多重実行防止）。
    if (voicePhaseRef.current === "processing" || voicePhaseRef.current === "confirm") return;
    if (returnTimerRef.current) {
      clearTimeout(returnTimerRef.current);
      returnTimerRef.current = null;
    }
    setVoicePhase("processing");
    setVoiceMessage(null);
    setVoiceNormalization(null);
    setVoicePending(null);
    setVoiceConfidence(null);
    try {
      const res = await fetch("/api/voice-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
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
      if (!data.ok) {
        if (data.ignored) {
          // 常時録音中に拾った、操作指示ではない発話（雑談・雑音等）。
          // エラー扱いにはせず、読み上げもせずに静かに聞き取りへ戻る。
          setVoicePhase("ignored");
          setVoiceMessage(`操作指示として認識しませんでした: 「${text}」`);
          scheduleReturnToListening(1200);
          return;
        }
        setVoicePhase("error");
        const msg = data.error ?? "指示を解釈できませんでした";
        setVoiceMessage(msg);
        if (ttsSupportedRef.current) ttsSpeakRef.current(msg);
        scheduleReturnToListening(4000);
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
      scheduleReturnToListening(2500);
    } catch (e) {
      setVoicePhase("error");
      const msg = `通信エラー: ${(e as Error).message}`;
      setVoiceMessage(msg);
      if (ttsSupportedRef.current) ttsSpeakRef.current(msg);
      scheduleReturnToListening(4000);
    }
  }, [ttsSpeakRef, ttsSupportedRef, voicePhaseRef, scheduleReturnToListening]);

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
      scheduleReturnToListening(2500);
    } catch (e) {
      setVoicePhase("error");
      const msg = `実行エラー: ${(e as Error).message}`;
      setVoiceMessage(msg);
      if (ttsSupportedRef.current) ttsSpeakRef.current(msg);
      scheduleReturnToListening(4000);
    } finally {
      setVoicePending(null);
    }
  }, [voicePendingRef, ttsSpeakRef, ttsSupportedRef, scheduleReturnToListening]);

  const cancelVoiceMove = useCallback(() => {
    setVoicePending(null);
    setVoicePhase("recording");
    const msg = "取消しました";
    setVoiceMessage(msg);
    if (ttsSupportedRef.current) ttsSpeakRef.current(msg);
    scheduleReturnToListening(1500);
  }, [ttsSpeakRef, ttsSupportedRef, scheduleReturnToListening]);

  const confirmVoiceMoveRef = useLatestRef(confirmVoiceMove);
  const cancelVoiceMoveRef = useLatestRef(cancelVoiceMove);

  const speech = useWhisperRecognition({ lang: "ja", onUtterance: handleTranscript });
  const speechStartRef = useLatestRef(speech.start);
  const speechStopRef = useLatestRef(speech.stop);
  const speechResetRef = useLatestRef(speech.reset);
  const isListeningRef = useLatestRef(speech.isListening);

  // 音声操作デモは既定で閉じておき、本来の工程詳細（カンバン）を主役にする。
  // BT リモートや録音開始で呼び出された時だけ自動展開し、フィードバックを見せる。
  const [voiceDemoOpen, setVoiceDemoOpen] = useState(false);

  const toggleVoice = useCallback(() => {
    if (returnTimerRef.current) {
      clearTimeout(returnTimerRef.current);
      returnTimerRef.current = null;
    }
    if (isListeningRef.current) {
      speechStopRef.current();
      setVoicePhase("idle");
      setVoiceMessage(null);
    } else {
      setVoicePhase("recording");
      setVoiceMessage(null);
      setVoiceNormalization(null);
      setVoiceDemoOpen(true);
      speechStartRef.current();
    }
  }, [isListeningRef, speechStartRef, speechStopRef]);

  const resetVoice = useCallback(() => {
    if (returnTimerRef.current) {
      clearTimeout(returnTimerRef.current);
      returnTimerRef.current = null;
    }
    if (isListeningRef.current) speechStopRef.current();
    speechResetRef.current();
    setVoicePending(null);
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

  // 「録音」ボタンは BT 連携の有効化/無効化と常時音声操作の開始/停止をまとめて行う。
  // BT 未対応環境では BT 連携をスキップし、録音のON/OFFだけを行う。
  const handleRecordingToggle = useCallback(() => {
    const startingNow = !isListeningRef.current;
    if (openfit.isSupported) {
      if (startingNow) openfit.enable();
      else openfit.disable();
    }
    toggleVoice();
  }, [isListeningRef, toggleVoice, openfit]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <VoiceDemoWidget
        open={voiceDemoOpen}
        onOpenChange={setVoiceDemoOpen}
        isListening={speech.isListening}
      >
        <VoiceCommandBar
          btError={openfit.error}
          speechSupported={speech.isSupported}
          isListening={speech.isListening}
          isSpeaking={speech.isSpeaking}
          lastText={speech.lastText}
          speechError={speech.error}
          phase={voicePhase}
          message={voiceMessage}
          normalization={voiceNormalization}
          confidence={voiceConfidence}
          pending={voicePending}
          onToggleRecording={handleRecordingToggle}
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
  btError,
  speechSupported,
  isListening,
  isSpeaking,
  lastText,
  speechError,
  phase,
  message,
  normalization,
  confidence,
  pending,
  onToggleRecording,
  onReset,
  onConfirm,
  onCancel,
}: {
  btError: Error | null;
  speechSupported: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  lastText: string;
  speechError: string | null;
  phase: VoicePhase;
  message: string | null;
  normalization: VoiceNormalization | null;
  confidence: number | null;
  pending: VoicePending | null;
  onToggleRecording: () => void;
  onReset: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const phaseLabel: Record<VoicePhase, string> = {
    idle: "待機中",
    recording: "🎧 聞いています",
    processing: "解析中...",
    confirm: "確認待ち",
    success: "✓ 実行完了",
    ignored: "－ 対象外の発話",
    error: "✕ エラー",
  };
  const phaseClass: Record<VoicePhase, string> = {
    idle: "bg-zinc-100 text-zinc-700",
    recording: "bg-teal-100 text-teal-700",
    processing: "bg-amber-100 text-amber-700",
    confirm: "bg-blue-100 text-blue-700",
    success: "bg-emerald-100 text-emerald-700",
    ignored: "bg-zinc-100 text-zinc-500",
    error: "bg-red-100 text-red-700",
  };
  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleRecording}
          disabled={!speechSupported}
          className={`rounded px-3 py-1 font-medium ${
            isListening
              ? "bg-red-600 text-white hover:bg-red-700"
              : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 disabled:opacity-50"
          }`}
        >
          {isListening ? "■ 録音停止" : "🎤 録音を開始"}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded border border-zinc-300 bg-white px-3 py-1 text-zinc-700 hover:bg-zinc-100"
        >
          ↺ リセット
        </button>
        <span
          className={`rounded px-2 py-0.5 font-mono text-[11px] ${phaseClass[phase]} ${
            isSpeaking ? "animate-pulse" : ""
          }`}
        >
          {isSpeaking && phase === "recording" ? "🗣 発話検出中..." : phaseLabel[phase]}
        </span>
        {confidence != null ? (
          <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-[10px] text-zinc-500">
            前回の確信度: {Math.round(confidence * 100)}%
          </span>
        ) : null}
      </div>
      <p className="text-[11px] leading-snug text-zinc-500">
        {isListening
          ? phase === "confirm"
            ? "BT: シングル→実行, ダブル→取消。"
            : "BT: シングル→録音 ON/OFF, ダブル→リセット。"
          : ""}
        「録音」を押すとBT連携も有効化し、マイクを常時オンのまま発話の切れ目を自動検出して順に処理します。
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

      {isListening ? (
        <div className="rounded border border-zinc-200 bg-white px-2 py-1">
          <span className="text-[10px] uppercase tracking-wide text-zinc-400">
            {isSpeaking ? "発話を検出中..." : "直近の認識テキスト"}
          </span>
          <p className="font-mono text-sm text-zinc-900">
            {lastText || <span className="text-zinc-400">話しかけてください...</span>}
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
                : phase === "ignored"
                  ? "border-zinc-200 bg-zinc-50 text-zinc-500"
                  : "border-zinc-200 bg-white text-zinc-700"
          }`}
        >
          {message}
        </div>
      ) : null}

      {!speechSupported ? (
        <span className="text-[11px] text-red-700">
          このブラウザはマイク録音（getUserMedia / MediaRecorder）に未対応です（Chrome / Safari を推奨）
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
