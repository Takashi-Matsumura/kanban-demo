"use client";

import { useEffect, useState } from "react";

export function TodayLabel() {
  const [label, setLabel] = useState<string>("");

  useEffect(() => {
    const id = setTimeout(() => {
      setLabel(
        new Intl.DateTimeFormat("ja-JP", {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "short",
        }).format(new Date()),
      );
    }, 0);
    return () => clearTimeout(id);
  }, []);

  return <span>{label}</span>;
}
