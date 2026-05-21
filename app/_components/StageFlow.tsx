import { Fragment } from "react";
import type { DashboardStage } from "@/lib/dashboard";

const COLOR_BOX: Record<string, string> = {
  green: "border-green-300 bg-green-50",
  amber: "border-amber-300 bg-amber-50",
  purple: "border-purple-300 bg-purple-50",
  sky: "border-sky-300 bg-sky-50",
  blue: "border-blue-300 bg-blue-50",
  red: "border-red-300 bg-red-50",
};

const COLOR_VALUE: Record<string, string> = {
  green: "text-green-700",
  amber: "text-amber-700",
  purple: "text-purple-700",
  sky: "text-sky-700",
  blue: "text-blue-700",
  red: "text-red-700",
};

const COLOR_DOT: Record<string, string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  purple: "bg-purple-500",
  sky: "bg-sky-500",
  blue: "bg-blue-500",
  red: "bg-red-500",
};

type Props = {
  stages: DashboardStage[];
};

export function StageFlow({ stages }: Props) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-end justify-between">
        <h3 className="text-sm font-semibold text-zinc-800">本日の製造フロー</h3>
        <p className="text-[10px] text-zinc-500">原材料 ▶ 出荷</p>
      </div>
      <div className="mt-3 flex items-stretch">
        {stages.map((stage, i) => (
          <Fragment key={stage.id}>
            <StageNode stage={stage} index={i} />
            {i < stages.length - 1 ? <FlowArrow active={stage.cardCount > 0} /> : null}
          </Fragment>
        ))}
      </div>
    </section>
  );
}

function StageNode({ stage, index }: { stage: DashboardStage; index: number }) {
  const empty = stage.cardCount === 0;
  const boxClass = empty
    ? "border border-dashed border-zinc-200 bg-zinc-50"
    : `border-2 ${COLOR_BOX[stage.color] ?? "border-zinc-300 bg-zinc-50"}`;
  const valueClass = empty
    ? "text-zinc-300"
    : COLOR_VALUE[stage.color] ?? "text-zinc-700";
  const dotClass = COLOR_DOT[stage.color] ?? "bg-zinc-400";
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md px-1 py-2 transition ${boxClass}`}
    >
      <div className="flex items-center gap-1">
        <span className="font-mono text-[10px] text-zinc-400">{index + 1}</span>
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass}`} />
      </div>
      <p className="w-full truncate text-center text-[11px] font-medium text-zinc-700">
        {stage.name}
      </p>
      <p className={`text-2xl font-semibold leading-none ${valueClass}`}>{stage.cardCount}</p>
    </div>
  );
}

function FlowArrow({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden
      className={`flex shrink-0 items-center justify-center px-0.5 text-xs ${
        active ? "text-zinc-500" : "text-zinc-300"
      }`}
    >
      ▶
    </div>
  );
}
