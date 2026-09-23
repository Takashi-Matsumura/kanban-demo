"use client";

import { useEffect, useRef } from "react";

/**
 * 最新の値を ref に保持する。イベントハンドラ内で毎回作り直さない
 * useCallback(fn, []) から、古いクロージャではなく最新値を読むために使う。
 * レンダー中に ref.current を直接更新すると react-hooks/refs に抵触するため、
 * コミット後（useEffect）に同期する。
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
