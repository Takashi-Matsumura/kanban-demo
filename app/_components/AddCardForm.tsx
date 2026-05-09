"use client";

import { useRef, useState, useTransition } from "react";
import { createCard } from "../actions";

type Props = {
  columnId: string;
};

export function AddCardForm({ columnId }: Props) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(formData: FormData) {
    const title = String(formData.get("title") ?? "");
    if (!title.trim()) return;
    startTransition(async () => {
      await createCard(columnId, title);
    });
    if (inputRef.current) inputRef.current.value = "";
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1 rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-700"
      >
        <span aria-hidden>＋</span> カードを追加
      </button>
    );
  }

  return (
    <form
      action={submit}
      onSubmit={(e) => {
        // 入力欄を閉じない（連投できるように）
        const form = e.currentTarget;
        setTimeout(() => form.reset(), 0);
      }}
      className="flex flex-col gap-2"
    >
      <input
        ref={inputRef}
        autoFocus
        name="title"
        placeholder="カードのタイトル"
        className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1 text-xs text-white hover:bg-zinc-800"
        >
          追加
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-200/60"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
