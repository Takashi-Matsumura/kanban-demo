"use client";

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
  /** true のとき、ノードをボタン化し、クリックで対応する Column 要素 (#stage-col-<id>) までスムーズスクロールする */
  clickable?: boolean;
  /** true のとき、各ノード下に「平均 m 分 / 標準 n 分」のサブテキストを表示 */
  showStats?: boolean;
};

export function StageFlow({ stages, clickable = false, showStats = false }: Props) {
  function handleClick(stageId: string) {
    if (typeof document === "undefined") return;
    const target = document.getElementById(`stage-col-${stageId}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-end justify-between">
        <h3 className="text-sm font-semibold text-zinc-800">本日の製造フロー</h3>
        <p className="text-[10px] text-zinc-500">
          {clickable ? "工程をクリックすると下のボードがその工程までスクロールします" : "原材料 ▶ 出荷"}
        </p>
      </div>
      <div className="mt-3 flex items-stretch">
        {stages.map((stage, i) => (
          <Fragment key={stage.id}>
            <StageNode
              stage={stage}
              index={i}
              clickable={clickable}
              showStats={showStats}
              onClick={() => handleClick(stage.id)}
            />
            {i < stages.length - 1 ? <FlowArrow active={stage.cardCount > 0} /> : null}
          </Fragment>
        ))}
      </div>
    </section>
  );
}

function StageNode({
  stage,
  index,
  clickable,
  showStats,
  onClick,
}: {
  stage: DashboardStage;
  index: number;
  clickable: boolean;
  showStats: boolean;
  onClick: () => void;
}) {
  const empty = stage.cardCount === 0;
  const boxClass = empty
    ? "border border-dashed border-zinc-200 bg-zinc-50"
    : `border-2 ${COLOR_BOX[stage.color] ?? "border-zinc-300 bg-zinc-50"}`;
  const valueClass = empty
    ? "text-zinc-300"
    : COLOR_VALUE[stage.color] ?? "text-zinc-700";
  const dotClass = COLOR_DOT[stage.color] ?? "bg-zinc-400";

  const content = (
    <>
      <div className="flex items-center gap-1">
        <span className="font-mono text-[10px] text-zinc-400">{index + 1}</span>
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass}`} />
      </div>
      <p className="w-full truncate text-center text-[11px] font-medium text-zinc-700">
        {stage.name}
      </p>
      <p className={`text-2xl font-semibold leading-none ${valueClass}`}>{stage.cardCount}</p>
      {showStats ? (
        <p className="mt-0.5 font-mono text-[9px] leading-tight text-zinc-500">
          {stage.avgDwellMinutes != null
            ? `平均 ${stage.avgDwellMinutes}`
            : "—"}
          {stage.expectedMinutes != null ? ` / 標準 ${stage.expectedMinutes}` : ""}
          {stage.avgDwellMinutes != null || stage.expectedMinutes != null ? " 分" : ""}
        </p>
      ) : null}
    </>
  );

  const baseClass = `flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md px-1 py-2 transition ${boxClass}`;

  if (clickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${stage.name} 工程へスクロール`}
        className={`${baseClass} cursor-pointer hover:-translate-y-0.5 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400`}
      >
        {content}
      </button>
    );
  }

  return <div className={baseClass}>{content}</div>;
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
