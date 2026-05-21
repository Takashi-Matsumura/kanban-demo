import { Fragment } from "react";
import { getDashboardSummary } from "@/lib/dashboard";
import { TodayLabel } from "./_components/TodayLabel";

const SHIFT_LABEL: Record<string, string> = {
  morning: "朝便",
  noon: "昼便",
  evening: "夕便",
};

const COLOR_DOT: Record<string, string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  purple: "bg-purple-500",
  sky: "bg-sky-500",
  blue: "bg-blue-500",
  red: "bg-red-500",
};

const COLOR_BAR: Record<string, string> = {
  green: "bg-green-400",
  amber: "bg-amber-400",
  purple: "bg-purple-400",
  sky: "bg-sky-400",
  blue: "bg-blue-400",
  red: "bg-red-400",
};

const PRIORITY_STYLE: Record<string, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  normal: "bg-zinc-100 text-zinc-600 border-zinc-200",
  low: "bg-zinc-50 text-zinc-500 border-zinc-200",
};

const PRIORITY_LABEL: Record<string, string> = {
  high: "高",
  normal: "通常",
  low: "低",
};

export default async function DashboardPage() {
  const summary = await getDashboardSummary();
  const maxStageCount = Math.max(1, ...summary.stages.map((s) => s.cardCount));
  const maxProductCount = Math.max(1, ...summary.products.map((p) => p.cardCount));

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
          <KpiCard label="高優先度" value={summary.totals.highPriority} accent="red" />
          <KpiCard label="進行中" value={summary.totals.inProgress} accent="blue" />
          <KpiCard label="出荷済" value={summary.totals.shipped} accent="green" />
        </div>

        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-zinc-800">工程別バッチ数</h3>
          <div className="mt-3 grid grid-cols-[8rem_1fr_2.5rem] items-center gap-x-3 gap-y-1.5 text-sm">
            {summary.stages.map((stage) => {
              const dotClass = COLOR_DOT[stage.color] ?? "bg-zinc-400";
              const barClass = COLOR_BAR[stage.color] ?? "bg-zinc-400";
              const pct = (stage.cardCount / maxStageCount) * 100;
              return (
                <Fragment key={stage.id}>
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
                    <span className="truncate text-zinc-700">{stage.name}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded bg-zinc-100">
                    <div
                      className={`h-full ${barClass}`}
                      style={{ width: stage.cardCount === 0 ? 0 : `${Math.max(4, pct)}%` }}
                    />
                  </div>
                  <span className="text-right font-mono text-zinc-600">{stage.cardCount}</span>
                </Fragment>
              );
            })}
          </div>
        </section>

        <div className="grid flex-1 grid-cols-2 gap-3 min-h-0">
          <section className="flex flex-col rounded-lg border border-zinc-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-zinc-800">製品別バッチ数</h3>
            <div className="mt-3 grid grid-cols-[7rem_1fr_2.5rem] items-center gap-x-3 gap-y-1.5 text-sm">
              {summary.products.map((p) => {
                const pct = (p.cardCount / maxProductCount) * 100;
                return (
                  <Fragment key={p.id}>
                    <span className="truncate text-zinc-700">{p.name}</span>
                    <div className="h-3 overflow-hidden rounded bg-zinc-100">
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
          </section>

          <section className="flex flex-col rounded-lg border border-zinc-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-zinc-800">直近のバッチ</h3>
            <ul className="mt-3 flex-1 space-y-2 overflow-hidden text-sm">
              {summary.recent.length === 0 ? (
                <li className="text-xs text-zinc-400">バッチがまだありません</li>
              ) : (
                summary.recent.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-2 rounded border border-zinc-100 bg-zinc-50/60 px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-zinc-900">
                        {b.productName}
                        {b.shift ? (
                          <span className="ml-1 text-xs text-zinc-500">{SHIFT_LABEL[b.shift] ?? b.shift}</span>
                        ) : null}
                      </p>
                      {b.lotCode ? (
                        <p className="truncate font-mono text-[10px] text-zinc-500">{b.lotCode}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-zinc-700">
                        {b.stageName}
                      </span>
                      {b.assignee ? (
                        <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-blue-700">
                          {b.assignee}
                        </span>
                      ) : null}
                      <span
                        className={`rounded border px-1.5 py-0.5 ${PRIORITY_STYLE[b.priority] ?? PRIORITY_STYLE.normal}`}
                      >
                        {PRIORITY_LABEL[b.priority] ?? b.priority}
                      </span>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "zinc" | "red" | "blue" | "green";
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
    </div>
  );
}
