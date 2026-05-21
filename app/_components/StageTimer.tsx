"use client";

import { useEffect, useState } from "react";

type Props = {
  enteredAt: string;
  expectedMinutes: number | null;
  targetReadyAt: string | null;
  equipmentName?: string | null;
  dragging?: boolean;
};

function formatMMSS(sec: number): string {
  const abs = Math.abs(sec);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function StageTimer({
  enteredAt,
  expectedMinutes,
  targetReadyAt,
  equipmentName,
  dragging,
}: Props) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (dragging) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [dragging]);

  if (now === null) return null;

  const targetMs = targetReadyAt
    ? new Date(targetReadyAt).getTime()
    : expectedMinutes != null
      ? new Date(enteredAt).getTime() + expectedMinutes * 60 * 1000
      : null;

  if (targetMs === null) return null;

  const remainSec = Math.floor((targetMs - now) / 1000);
  const overdue = remainSec < 0;
  const warning = !overdue && remainSec <= 5 * 60;

  const cls = overdue
    ? "border-red-300 bg-red-50 text-red-700 animate-pulse"
    : warning
      ? "border-amber-300 bg-amber-50 text-amber-700"
      : "border-emerald-300 bg-emerald-50 text-emerald-700";

  const label = overdue ? `+${formatMMSS(remainSec)}` : formatMMSS(remainSec);
  const subLabel = overdue
    ? "標準超過"
    : warning
      ? "残り少"
      : targetReadyAt
        ? "目標まで"
        : "標準まで";

  return (
    <div className={`mt-2 rounded-md border px-2 py-1.5 ${cls}`}>
      <div className="flex items-center justify-between text-[10px] font-medium">
        <span>{subLabel}</span>
        {equipmentName ? (
          <span className="rounded bg-white/60 px-1 py-0.5 font-mono text-zinc-700">
            {equipmentName}
          </span>
        ) : (
          <span className="text-zinc-400">設備未割当</span>
        )}
      </div>
      <div className="mt-0.5 text-center font-mono text-lg font-semibold leading-tight">{label}</div>
    </div>
  );
}
