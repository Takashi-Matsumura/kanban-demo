"use client";

import { useEffect, useState, useTransition } from "react";
import type {
  BoardCard,
  BoardColumn,
  BoardEquipment,
  BoardQualityCheck,
  BoardStageHistory,
} from "@/lib/board";
import { equipmentTypeForStage } from "@/lib/stage-equipment";
import {
  addQualityCheck,
  deleteCard,
  deleteQualityCheck,
  overrideTargetReadyAt,
  setEquipmentForCard,
  updateBatchMeta,
} from "../actions";

type Props = {
  card: BoardCard;
  columns?: BoardColumn[];
  stageType?: string | null;
  equipments?: BoardEquipment[];
  onClose: () => void;
};

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateTime(iso: string) {
  return dateFormatter.format(new Date(iso));
}

function formatTime(iso: string) {
  return timeFormatter.format(new Date(iso));
}

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toDateTimeInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const QUALITY_TYPE_LABEL: Record<string, string> = {
  temperature: "温度",
  humidity: "湿度",
  weight: "重量",
  visual: "外観",
};

type TabKey = "basic" | "quality" | "history" | "memo";

const TABS: { key: TabKey; label: string }[] = [
  { key: "basic", label: "基本" },
  { key: "quality", label: "品質" },
  { key: "history", label: "工程履歴" },
  { key: "memo", label: "メモ" },
];

export function CardDetail({ card, columns = [], stageType, equipments = [], onClose }: Props) {
  const [tab, setTab] = useState<TabKey>("basic");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const columnNameById = new Map(columns.map((c) => [c.id, c.name]));
  const failedQuality = card.qualityChecks.filter((q) => !q.passed).length;

  return (
    <>
      <div aria-hidden onClick={onClose} className="fixed inset-0 z-40 bg-black/20" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-detail-title"
        className="fixed inset-y-0 right-0 z-50 flex w-[460px] max-w-full flex-col border-l border-zinc-200 bg-white shadow-xl"
      >
        <header className="border-b border-zinc-200 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {card.lotCode ? (
                <p className="font-mono text-[11px] text-zinc-500">{card.lotCode}</p>
              ) : null}
              <h2 id="card-detail-title" className="truncate text-base font-semibold text-zinc-900">
                {card.product?.name ?? card.title}
              </h2>
              {card.product ? (
                <p className="mt-0.5 text-xs text-zinc-500">
                  {card.product.category}・SKU {card.product.sku}
                </p>
              ) : null}
              {card.product?.allergens && card.product.allergens.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {card.product.allergens.map((a) => (
                    <span
                      key={a.id}
                      title={a.name}
                      className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-700"
                    >
                      {a.icon ?? a.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
            >
              <CloseIcon />
            </button>
          </div>
          <nav className="mt-3 flex gap-1 border-b border-transparent" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`relative -mb-px rounded-t px-3 py-1.5 text-xs font-medium ${
                  tab === t.key
                    ? "border border-b-white border-zinc-200 bg-white text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                }`}
              >
                {t.label}
                {t.key === "quality" && failedQuality > 0 ? (
                  <span className="ml-1 rounded-full bg-red-500 px-1 text-[9px] text-white">{failedQuality}</span>
                ) : null}
                {t.key === "quality" && failedQuality === 0 && card.qualityChecks.length > 0 ? (
                  <span className="ml-1 rounded-full bg-zinc-200 px-1 text-[9px] text-zinc-600">
                    {card.qualityChecks.length}
                  </span>
                ) : null}
                {t.key === "history" && card.histories.length > 0 ? (
                  <span className="ml-1 rounded-full bg-zinc-200 px-1 text-[9px] text-zinc-600">
                    {card.histories.length}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {tab === "basic" ? (
            <BasicTab card={card} stageType={stageType ?? null} equipments={equipments} />
          ) : null}
          {tab === "quality" ? (
            <QualityTab card={card} columnNameById={columnNameById} />
          ) : null}
          {tab === "history" ? (
            <HistoryTab card={card} columnNameById={columnNameById} />
          ) : null}
          {tab === "memo" ? <MemoTab card={card} /> : null}
        </div>

        <footer className="border-t border-zinc-200 px-4 py-3">
          <DeleteButton cardId={card.id} onClosed={onClose} />
        </footer>
      </aside>
    </>
  );
}

// ─── 基本タブ ────────────────────────────────────────────────────────

function BasicTab({
  card,
  stageType,
  equipments,
}: {
  card: BoardCard;
  stageType: string | null;
  equipments: BoardEquipment[];
}) {
  const [plannedQty, setPlannedQty] = useState(card.plannedQty?.toString() ?? "");
  const [actualQty, setActualQty] = useState(card.actualQty?.toString() ?? "");
  const [assignee, setAssignee] = useState(card.assignee ?? "");
  const [priority, setPriority] = useState(card.priority ?? "normal");
  const [shift, setShift] = useState(card.shift ?? "");
  const [batchDate, setBatchDate] = useState(toDateInput(card.batchDate));
  const [equipmentId, setEquipmentId] = useState(card.equipment?.id ?? "");
  const [targetReadyAt, setTargetReadyAt] = useState(toDateTimeInput(card.targetReadyAt));
  const [, startTransition] = useTransition();

  const requiredEquipmentType = equipmentTypeForStage(stageType);
  const showEquipmentSection = requiredEquipmentType != null;
  const candidateEquipments = requiredEquipmentType
    ? equipments.filter((e) => e.type === requiredEquipmentType)
    : [];

  function commit(patch: Parameters<typeof updateBatchMeta>[1]) {
    startTransition(async () => {
      await updateBatchMeta(card.id, patch);
    });
  }

  function commitPlannedQty() {
    const original = card.plannedQty?.toString() ?? "";
    if (plannedQty === original) return;
    const n = plannedQty.trim() === "" ? null : Number(plannedQty);
    if (n !== null && (!Number.isFinite(n) || n < 0)) {
      setPlannedQty(original);
      return;
    }
    commit({ plannedQty: n });
  }

  function commitActualQty() {
    const original = card.actualQty?.toString() ?? "";
    if (actualQty === original) return;
    const n = actualQty.trim() === "" ? null : Number(actualQty);
    if (n !== null && (!Number.isFinite(n) || n < 0)) {
      setActualQty(original);
      return;
    }
    commit({ actualQty: n });
  }

  function commitAssignee() {
    if (assignee === (card.assignee ?? "")) return;
    commit({ assignee });
  }

  function commitEquipment(next: string) {
    setEquipmentId(next);
    startTransition(async () => {
      await setEquipmentForCard(card.id, next === "" ? null : next);
    });
  }

  function commitTargetReadyAt(next: string) {
    setTargetReadyAt(next);
    startTransition(async () => {
      await overrideTargetReadyAt(card.id, next === "" ? null : new Date(next).toISOString());
    });
  }

  return (
    <>
      <FieldRow>
        <Field label="計画数量">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={plannedQty}
            onChange={(e) => setPlannedQty(e.target.value)}
            onBlur={commitPlannedQty}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
          />
        </Field>
        <Field label="実績数量">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={actualQty}
            onChange={(e) => setActualQty(e.target.value)}
            onBlur={commitActualQty}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
          />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="担当者">
          <input
            type="text"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            onBlur={commitAssignee}
            placeholder="例: 田中"
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
          />
        </Field>
        <Field label="優先度">
          <select
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value);
              commit({ priority: e.target.value });
            }}
            className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="low">低</option>
            <option value="normal">通常</option>
            <option value="high">高</option>
          </select>
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="シフト">
          <select
            value={shift}
            onChange={(e) => {
              setShift(e.target.value);
              commit({ shift: e.target.value === "" ? null : e.target.value });
            }}
            className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">（未設定）</option>
            <option value="morning">朝</option>
            <option value="noon">昼</option>
            <option value="evening">夕</option>
          </select>
        </Field>
        <Field label="バッチ日付">
          <input
            type="date"
            value={batchDate}
            onChange={(e) => {
              setBatchDate(e.target.value);
              commit({ batchDate: e.target.value === "" ? null : e.target.value });
            }}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
          />
        </Field>
      </FieldRow>

      {showEquipmentSection ? (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <h3 className="text-xs font-semibold text-emerald-800">
            {requiredEquipmentType === "proofer" ? "ホイロ割当・目標完了時刻" : "オーブン割当・目標完了時刻"}
          </h3>
          <FieldRow>
            <Field label="使用設備">
              <select
                value={equipmentId}
                onChange={(e) => commitEquipment(e.target.value)}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">（未割当）</option>
                {candidateEquipments.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.name}
                    {eq.capacity != null ? `（最大 ${eq.capacity}）` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="目標完了時刻（上書き）">
              <div className="flex gap-1">
                <input
                  type="datetime-local"
                  value={targetReadyAt}
                  onChange={(e) => commitTargetReadyAt(e.target.value)}
                  className="flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                />
                {targetReadyAt ? (
                  <button
                    type="button"
                    onClick={() => commitTargetReadyAt("")}
                    className="rounded border border-zinc-300 bg-white px-2 text-xs text-zinc-600 hover:bg-zinc-100"
                    aria-label="目標時刻をクリア"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </Field>
          </FieldRow>
          <p className="mt-2 text-[10px] text-emerald-700">
            目標完了時刻が未設定のときは「工程入室時刻 + 標準時間」をタイマー基準とします。
          </p>
        </div>
      ) : null}

      <dl className="mt-6 grid grid-cols-[6rem_1fr] gap-y-1 text-xs text-zinc-600">
        <dt className="font-medium">作成日時</dt>
        <dd>{formatDateTime(card.createdAt)}</dd>
        <dt className="font-medium">更新日時</dt>
        <dd>{formatDateTime(card.updatedAt)}</dd>
      </dl>
    </>
  );
}

// ─── 品質タブ ────────────────────────────────────────────────────────

function QualityTab({
  card,
  columnNameById,
}: {
  card: BoardCard;
  columnNameById: Map<string, string>;
}) {
  const [type, setType] = useState("temperature");
  const [value, setValue] = useState("");
  const [passed, setPassed] = useState<"true" | "false">("true");
  const [note, setNote] = useState("");
  const [byUser, setByUser] = useState(card.assignee ?? "");
  const [, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await addQualityCheck({
        cardId: card.id,
        columnId: card.columnId,
        type,
        value,
        passed: passed === "true",
        note,
        byUser,
      });
    });
    setValue("");
    setNote("");
  }

  function onDeleteCheck(id: string) {
    if (!confirm("このチェック記録を削除しますか？")) return;
    startTransition(async () => {
      await deleteQualityCheck(id);
    });
  }

  return (
    <>
      <form
        onSubmit={onSubmit}
        className="rounded-md border border-blue-200 bg-blue-50 p-3"
      >
        <h3 className="text-xs font-semibold text-blue-800">
          現工程「{columnNameById.get(card.columnId) ?? "—"}」のチェックを追加
        </h3>
        <FieldRow>
          <Field label="種類">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
            >
              <option value="temperature">温度</option>
              <option value="humidity">湿度</option>
              <option value="weight">重量</option>
              <option value="visual">外観</option>
            </select>
          </Field>
          <Field label="値">
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="例: 26（℃）"
              className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
            />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="判定">
            <div className="mt-1 flex gap-3 text-xs">
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="passed"
                  value="true"
                  checked={passed === "true"}
                  onChange={() => setPassed("true")}
                />
                合格
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="passed"
                  value="false"
                  checked={passed === "false"}
                  onChange={() => setPassed("false")}
                />
                不合格
              </label>
            </div>
          </Field>
          <Field label="記録者">
            <input
              type="text"
              value={byUser}
              onChange={(e) => setByUser(e.target.value)}
              placeholder="例: 田中"
              className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
            />
          </Field>
        </FieldRow>
        <div className="mt-2">
          <label className="block text-xs font-semibold text-blue-800">メモ</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="例: 生地温度の確認"
            className="mt-1 w-full resize-y rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
          />
        </div>
        <div className="mt-2 text-right">
          <button
            type="submit"
            className="rounded bg-blue-700 px-3 py-1 text-xs text-white hover:bg-blue-800"
          >
            追加
          </button>
        </div>
      </form>

      <h3 className="mt-4 text-xs font-semibold text-zinc-700">
        このバッチのチェック記録（{card.qualityChecks.length} 件）
      </h3>
      {card.qualityChecks.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-400">まだチェック記録がありません</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {card.qualityChecks.map((q) => (
            <QualityRow
              key={q.id}
              q={q}
              stageName={columnNameById.get(q.columnId) ?? "—"}
              onDelete={() => onDeleteCheck(q.id)}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function QualityRow({
  q,
  stageName,
  onDelete,
}: {
  q: BoardQualityCheck;
  stageName: string;
  onDelete: () => void;
}) {
  const typeLabel = QUALITY_TYPE_LABEL[q.type] ?? q.type;
  const passedClass = q.passed
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-red-200 bg-red-50 text-red-700";
  return (
    <li className="rounded border border-zinc-200 bg-white p-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded border px-1.5 py-0.5 ${passedClass}`}>
              {q.passed ? "合格" : "不合格"}
            </span>
            <span className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-zinc-700">
              {typeLabel}
            </span>
            {q.value ? <span className="font-mono text-zinc-900">{q.value}</span> : null}
            <span className="text-zinc-400">@ {stageName}</span>
          </div>
          {q.note ? <p className="mt-1 text-zinc-600">{q.note}</p> : null}
          <p className="mt-1 text-[10px] text-zinc-400">
            {formatDateTime(q.checkedAt)} {q.byUser ? `／ ${q.byUser}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          aria-label="削除"
          className="text-zinc-300 hover:text-red-500"
        >
          <TrashIcon />
        </button>
      </div>
    </li>
  );
}

// ─── 履歴タブ ────────────────────────────────────────────────────────

function HistoryTab({
  card,
  columnNameById,
}: {
  card: BoardCard;
  columnNameById: Map<string, string>;
}) {
  if (card.histories.length === 0) {
    return <p className="text-xs text-zinc-400">工程履歴がありません</p>;
  }
  return (
    <ol className="space-y-2">
      {card.histories.map((h, i) => (
        <HistoryRow key={h.id} h={h} stageName={columnNameById.get(h.columnId) ?? "—"} index={i} />
      ))}
    </ol>
  );
}

function HistoryRow({
  h,
  stageName,
  index,
}: {
  h: BoardStageHistory;
  stageName: string;
  index: number;
}) {
  const ongoing = h.leftAt === null;
  const minutes = h.durationSec != null ? Math.round(h.durationSec / 60) : null;
  return (
    <li className="flex items-start gap-2 text-xs">
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-200 font-mono text-[10px] text-zinc-700">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1 rounded border border-zinc-200 bg-white p-2">
        <div className="flex items-center justify-between">
          <span className="font-medium text-zinc-800">{stageName}</span>
          {ongoing ? (
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
              滞在中
            </span>
          ) : minutes != null ? (
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-700">
              {minutes} 分
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[10px] text-zinc-500">
          {formatTime(h.enteredAt)} 入室
          {h.leftAt ? ` → ${formatTime(h.leftAt)} 退出` : ""}
        </p>
      </div>
    </li>
  );
}

// ─── メモタブ ────────────────────────────────────────────────────────

function MemoTab({ card }: { card: BoardCard }) {
  const [note, setNote] = useState(card.note ?? "");
  const [description, setDescription] = useState(card.description ?? "");
  const [, startTransition] = useTransition();

  function commitNote() {
    if (note === (card.note ?? "")) return;
    startTransition(async () => {
      await updateBatchMeta(card.id, { note });
    });
  }

  function commitDescription() {
    if (description === (card.description ?? "")) return;
    startTransition(async () => {
      await updateBatchMeta(card.id, { description });
    });
  }

  return (
    <>
      <div>
        <label className="block text-xs font-semibold text-zinc-600">現場メモ・特記事項</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={commitNote}
          rows={4}
          placeholder="例: 新人ペア作業のためフォロー要"
          className="mt-1 w-full resize-y rounded border border-zinc-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
      <div className="mt-4">
        <label className="block text-xs font-semibold text-zinc-600">説明（任意）</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={commitDescription}
          rows={4}
          className="mt-1 w-full resize-y rounded border border-zinc-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
    </>
  );
}

// ─── 共通 ────────────────────────────────────────────────────────────

function DeleteButton({ cardId, onClosed }: { cardId: string; onClosed: () => void }) {
  const [, startTransition] = useTransition();
  function onDelete() {
    if (!confirm("このバッチを削除しますか？")) return;
    startTransition(async () => {
      await deleteCard(cardId);
    });
    onClosed();
  }
  return (
    <button
      type="button"
      onClick={onDelete}
      className="rounded border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
    >
      このバッチを削除
    </button>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 grid grid-cols-2 gap-3">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-600">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M2.5 4h9M5.5 4V2.5h3V4M3.5 4l.5 8h6l.5-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
