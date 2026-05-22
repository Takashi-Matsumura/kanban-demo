import { Fragment } from "react";
import { getKpiSummary } from "@/lib/kpi";

const COLOR_BAR: Record<string, string> = {
  green: "bg-green-400",
  amber: "bg-amber-400",
  purple: "bg-purple-400",
  sky: "bg-sky-400",
  blue: "bg-blue-400",
  red: "bg-red-400",
};

const COLOR_DOT: Record<string, string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  purple: "bg-purple-500",
  sky: "bg-sky-500",
  blue: "bg-blue-500",
  red: "bg-red-500",
};

const TYPE_LABEL: Record<string, string> = {
  temperature: "温度",
  humidity: "湿度",
  weight: "重量",
  visual: "外観",
};

function formatMinutes(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min} 分`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} 時間` : `${h} 時間 ${m} 分`;
}

export default async function KpiPage() {
  const summary = await getKpiSummary();

  return (
    <main className="px-6 py-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">振り返り KPI</h2>
          <p className="text-xs text-zinc-500">過去 7 日間の集計 / 管理者向け</p>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <KpiCard
            label="昨日の出荷バッチ数"
            value={summary.yesterday.completedBatches}
            accent="zinc"
          />
          <KpiCard
            label="過去 7 日 出荷バッチ"
            value={summary.lastWeek.completedBatches}
            accent="zinc"
            footer={
              summary.lastWeek.leadTimeSampleCount > 0
                ? `${summary.lastWeek.leadTimeSampleCount} 件分のサンプル`
                : "サンプルなし"
            }
          />
          <KpiCard
            label="平均リードタイム"
            value={formatMinutes(summary.lastWeek.avgLeadTimeMinutes)}
            accent="blue"
            footer="仕込開始 → 出荷"
          />
          <KpiCard
            label="品質合格率"
            value={`${Math.round(summary.quality.passRate * 100)}%`}
            accent={summary.quality.failed === 0 ? "green" : "red"}
            footer={`合格 ${summary.quality.passed} / 不合格 ${summary.quality.failed}`}
          />
        </div>

        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex items-end justify-between">
            <h3 className="text-sm font-semibold text-zinc-800">工程別の標準比（過去 7 日）</h3>
            {summary.bottleneck ? (
              <p className="text-xs text-zinc-500">
                ボトルネック：
                <span className="font-semibold text-red-600">
                  {summary.bottleneck.stageName}
                </span>
                （標準 {summary.bottleneck.expectedMinutes} 分 → 実績 {summary.bottleneck.avgMinutes}{" "}
                分 / 比 {summary.bottleneck.ratio.toFixed(2)}x）
              </p>
            ) : (
              <p className="text-xs text-zinc-400">サンプル不足のためボトルネック未算出</p>
            )}
          </div>
          <div className="mt-3 grid grid-cols-[10rem_1fr_8rem] items-center gap-x-3 gap-y-1.5 text-sm">
            {summary.stages.map((s) => {
              const ratio =
                s.avgMinutes != null && s.expectedMinutes && s.expectedMinutes > 0
                  ? s.avgMinutes / s.expectedMinutes
                  : null;
              const barWidth = ratio != null ? Math.min(160, ratio * 100) : 0; // 1.6x で打ち止め
              const cls =
                ratio == null
                  ? "bg-zinc-200"
                  : ratio > 1.2
                    ? "bg-red-400"
                    : ratio > 1
                      ? "bg-amber-400"
                      : COLOR_BAR[s.color] ?? "bg-zinc-400";
              return (
                <Fragment key={s.id}>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${COLOR_DOT[s.color] ?? "bg-zinc-400"}`}
                    />
                    <span className="truncate text-zinc-700">{s.name}</span>
                  </div>
                  <div className="relative h-3 overflow-hidden rounded bg-zinc-100">
                    <div className="absolute inset-y-0 left-[62.5%] w-px bg-zinc-400" aria-hidden />
                    <div
                      className={`h-full ${cls}`}
                      style={{ width: `${(barWidth / 160) * 100}%` }}
                    />
                  </div>
                  <span className="text-right font-mono text-xs text-zinc-700">
                    {s.avgMinutes != null
                      ? `${s.avgMinutes} / ${s.expectedMinutes ?? "—"} 分`
                      : "サンプルなし"}
                  </span>
                </Fragment>
              );
            })}
          </div>
          <p className="mt-3 text-[10px] text-zinc-500">
            縦線は標準時間（1.0x）。それを超えると黄、1.2x を超えると赤。
          </p>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-zinc-800">アレルゲン別 出荷バッチ数</h3>
            <p className="mt-0.5 text-[10px] text-zinc-500">過去 7 日に出荷した製品が含むアレルゲン件数</p>
            {summary.allergens.length === 0 ? (
              <p className="mt-3 text-xs text-zinc-400">対象バッチがありません</p>
            ) : (
              <ul className="mt-3 space-y-1.5 text-sm">
                {summary.allergens.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-700">
                        {a.icon ?? a.name}
                      </span>
                      <span className="text-zinc-800">{a.name}</span>
                    </div>
                    <span className="font-mono text-xs text-zinc-700">
                      {a.shippedBatchCount} 件
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-zinc-800">直近の品質不合格</h3>
            <p className="mt-0.5 text-[10px] text-zinc-500">最新 5 件</p>
            {summary.quality.recentFailures.length === 0 ? (
              <p className="mt-3 text-xs text-emerald-600">該当なし — 直近の不合格は発生していません</p>
            ) : (
              <ul className="mt-3 space-y-1.5 text-xs">
                {summary.quality.recentFailures.map((f) => (
                  <li
                    key={f.id}
                    className="rounded border border-red-200 bg-red-50 p-2"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-white px-1.5 py-0.5 text-zinc-700">
                        {TYPE_LABEL[f.type] ?? f.type}
                      </span>
                      {f.value ? <span className="font-mono text-zinc-900">{f.value}</span> : null}
                      <span className="text-zinc-500">@ {f.stageName}</span>
                    </div>
                    <p className="mt-0.5 text-zinc-700">
                      {f.productName ?? "—"} {f.cardLotCode ? `（${f.cardLotCode}）` : ""}
                    </p>
                    {f.note ? <p className="mt-0.5 text-zinc-600">{f.note}</p> : null}
                    <p className="mt-0.5 text-[10px] text-zinc-500">
                      {new Date(f.checkedAt).toLocaleString("ja-JP")}
                      {f.byUser ? `／${f.byUser}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
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
  footer,
}: {
  label: string;
  value: number | string;
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
      <p className={`mt-1 text-2xl font-semibold ${accentClass}`}>{value}</p>
      {footer ? <p className="mt-1 text-[10px] text-zinc-500">{footer}</p> : null}
    </div>
  );
}
