"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const TABS = [
  { href: "/", label: "ダッシュボード" },
  { href: "/board", label: "工程詳細" },
  { href: "/kpi", label: "振り返り" },
  { href: "/db", label: "データベース" },
];

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [resetting, setResetting] = useState(false);
  const [, startTransition] = useTransition();

  const onReset = async () => {
    if (resetting) return;
    if (
      !window.confirm(
        "現在の全データを削除し、当日のサンプルデータを再生成します。よろしいですか？",
      )
    ) {
      return;
    }
    setResetting(true);
    try {
      const res = await fetch("/api/db-reset", { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        window.alert(data.error ?? "リセットに失敗しました");
        return;
      }
      startTransition(() => router.refresh());
    } catch (e) {
      window.alert(`リセットに失敗しました: ${(e as Error).message}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-3">
        <div className="flex items-center gap-6">
          <h1 className="text-base font-semibold text-zinc-900">製パンライン カンバン</h1>
          <nav className="flex gap-1">
            {TABS.map((tab) => {
              const active =
                tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`rounded px-3 py-1 text-sm transition ${
                    active
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <button
          type="button"
          onClick={onReset}
          disabled={resetting}
          className="rounded border border-zinc-300 px-3 py-1 text-sm text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
          title="DB を当日のサンプルデータにリセット"
        >
          {resetting ? "リセット中…" : "サンプルをリセット"}
        </button>
      </div>
    </header>
  );
}
