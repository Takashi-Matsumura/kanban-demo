"use client";

import { useEffect, useState } from "react";

export function TodayLabel() {
  const [label, setLabel] = useState<string>("");

  useEffect(() => {
    setLabel(
      new Intl.DateTimeFormat("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
      }).format(new Date()),
    );
  }, []);

  return <span>{label}</span>;
}
