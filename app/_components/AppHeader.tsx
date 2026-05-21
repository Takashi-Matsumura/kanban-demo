"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "ダッシュボード" },
  { href: "/board", label: "工程詳細" },
  { href: "/db", label: "データベース" },
];

export function AppHeader() {
  const pathname = usePathname();

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
      </div>
    </header>
  );
}
