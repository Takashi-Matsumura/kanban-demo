import { Fragment } from "react";
import { getDashboardSummary } from "@/lib/dashboard";
import type { DashboardAttention } from "@/lib/dashboard";
import { TodayLabel } from "./_components/TodayLabel";
import { StageFlow } from "./_components/StageFlow";

const REASON_LABEL: Record<DashboardAttention["reasons"][number], string> = {
  overdue: "標準超過",
  failedQuality: "品質不合格",
  noEquipment: "設備未割当",
};

const REASON_STYLE: Record<DashboardAttention["reasons"][number], string> = {
  overdue: "bg-red-100 text-red-700 border-red-200",
  failedQuality: "bg-rose-100 text-rose-700 border-rose-200",
  noEquipment: "bg-amber-100 text-amber-800 border-amber-200",
};

const COLOR_DOT: Record<string, string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  purple: "bg-purple-500",
  sky: "bg-sky-500",
  blue: "bg-blue-500",
  red: "bg-red-500",
};

export default async function DashboardPage() {
  const summary = await getDashboardSummary();
  const maxProductCount = Math.max(1, ...summary.products.map((p) => p.cardCount));
  const maxAllergenCount = Math.max(1, ...summary.allergens.map((a) => a.cardCount));

  return (
    <main className="flex-1 px-6 py-4">
      <div className="mx-auto flex h-full max-w-7xl flex-col gap-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900">本日の製造ダッシュボード</h2>
            <p className="text-xs text-zinc-500">
              <TodayLabel /> <span className="ml-1">/ 工場全体の見える化</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <KpiCard label="本日の合計バッチ" value={summary.totals.total} accent="zinc" />
          <KpiCard
            label="要注意バッチ"
            value={summary.totals.attention}
            accent={summary.totals.attention > 0 ? "red" : "zinc"}
            footer="標準超過 / 品質不合格 / 設備未割当"
          />
          <KpiCard label="進行中" value={summary.totals.inProgress} accent="blue" />
          <KpiCard label="出荷済" value={summary.totals.shipped} accent="green" />
        </div>

        <StageFlow stages={summary.stages} showStats />

        <div className="grid flex-1 grid-cols-2 gap-3 min-h-0">
          <section className="flex flex-col rounded-lg border border-zinc-200 bg-white p-4">
            <div className="flex items-end justify-between">
              <h3 className="text-sm font-semibold text-zinc-800">要注意バッチ</h3>
              <p className="text-[10px] text-zinc-500">
                {summary.attentions.length === 0
                  ? "問題なし"
                  : `${summary.totals.attention} 件中 上位 ${summary.attentions.length} 件`}
              </p>
            </div>
            {summary.attentions.length === 0 ? (
              <p className="mt-3 text-xs text-emerald-600">
                すべてのバッチが標準時間内で進行中、品質も合格、設備も割当済みです
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5 overflow-y-auto text-sm">
                {summary.attentions.map((a) => (
                  <AttentionRow key={a.id} a={a} />
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col rounded-lg border border-zinc-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-zinc-800">製品別 / アレルゲン別</h3>
            <div className="mt-3 grid grid-cols-[5rem_1fr_2rem] items-center gap-x-2 gap-y-1 text-xs">
              {summary.products.map((p) => {
                const pct = (p.cardCount / maxProductCount) * 100;
                return (
                  <Fragment key={p.id}>
                    <span className="truncate text-zinc-700">{p.name}</span>
                    <div className="h-2.5 overflow-hidden rounded bg-zinc-100">
                      <div
                        className="h-full bg-zinc-400"
                        style={{ width: p.cardCount === 0 ? 0 : `${Math.max(4, pct)}%` }}
                      />
                    </div>
                    <span className="text-right font-mono text-zinc-600">{p.cardCount}</span>
                  </Fragment>
                );
              })}
            </div>
            <div className="mt-3 border-t border-zinc-100 pt-3">
              <p className="text-[10px] text-zinc-500">進行中バッチに含まれるアレルゲン</p>
              {summary.allergens.length === 0 ? (
                <p className="mt-2 text-xs text-zinc-400">対象バッチなし</p>
              ) : (
                <div className="mt-2 grid grid-cols-[5rem_1fr_2rem] items-center gap-x-2 gap-y-1 text-xs">
                  {summary.allergens.map((a) => {
                    const pct = (a.cardCount / maxAllergenCount) * 100;
                    return (
                      <Fragment key={a.id}>
                        <div className="flex items-center gap-1">
                          <span className="rounded border border-rose-200 bg-rose-50 px-1 text-[9px] text-rose-700">
                            {a.icon ?? a.name}
                          </span>
                          <span className="truncate text-zinc-700">{a.name}</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded bg-zinc-100">
                          <div
                            className="h-full bg-rose-300"
                            style={{ width: a.cardCount === 0 ? 0 : `${Math.max(4, pct)}%` }}
                          />
                        </div>
                        <span className="text-right font-mono text-zinc-600">{a.cardCount}</span>
                      </Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function AttentionRow({ a }: { a: DashboardAttention }) {
  const dotClass = COLOR_DOT[a.stageColor] ?? "bg-zinc-400";
  return (
    <li className="flex items-center justify-between gap-2 rounded border border-zinc-200 bg-zinc-50/60 px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass}`} />
          <span className="text-xs text-zinc-500">{a.stageName}</span>
          {a.assignee ? (
            <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
              {a.assignee}
            </span>
          ) : null}
        </div>
        <p className="truncate text-sm text-zinc-900">{a.productName}</p>
        {a.lotCode ? (
          <p className="truncate font-mono text-[10px] text-zinc-500">{a.lotCode}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {a.reasons.map((r) => (
          <span
            key={r}
            className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${REASON_STYLE[r]}`}
          >
            {REASON_LABEL[r]}
            {r === "overdue" && a.overdueMinutes != null ? ` +${a.overdueMinutes}分` : ""}
          </span>
        ))}
      </div>
    </li>
  );
}

function KpiCard({
  label,
  value,
  accent,
  footer,
}: {
  label: string;
  value: number;
  accent: "zinc" | "red" | "blue" | "green";
  footer?: string;
}) {
  const accentClass = {
    zinc: "text-zinc-900",
    red: "text-red-600",
    blue: "text-blue-600",
    green: "text-green-600",
  }[accent];
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${accentClass}`}>{value}</p>
      {footer ? <p className="mt-1 text-[10px] text-zinc-500">{footer}</p> : null}
    </div>
  );
}
