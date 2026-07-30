"use client";

import { useState } from "react";
import { formatVND, parseAmount } from "@/lib/money";
import { setBudget } from "@/lib/transactions";

interface Props {
  uid: string;
  month: string;
  limit: number | null;
  spent: number;
}

/** Ngưỡng "sắp chạm hạn mức" — cảnh báo sớm trước khi thực sự vượt. */
const WARN_AT = 0.8;

export function BudgetBar({ uid, month, limit, spent }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await setBudget(uid, month, parseAmount(draft));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="card p-4">
        <label className="text-ink-2 block text-xs font-medium">
          Hạn mức chi tiêu tháng này
        </label>
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="vd: 10tr"
            className="field tabular-nums"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="bg-brand shrink-0 rounded-lg px-4 text-sm font-medium text-white transition-opacity disabled:opacity-50"
          >
            Lưu
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-muted hover:text-ink shrink-0 rounded-lg px-2 text-sm"
          >
            Huỷ
          </button>
        </div>
        <p className="text-muted mt-1.5 text-xs">
          {parseAmount(draft) > 0
            ? `= ${formatVND(parseAmount(draft))}`
            : "Đặt 0 để bỏ hạn mức."}
        </p>
      </div>
    );
  }

  const startEditing = () => {
    setDraft(limit ? String(limit) : "");
    setEditing(true);
  };

  if (!limit) {
    return (
      <button
        type="button"
        onClick={startEditing}
        className="card animate-rise liftable text-ink-2 hover:text-ink w-full px-4 py-3 text-left text-sm"
      >
        🎯 Đặt hạn mức chi tiêu cho tháng này
      </button>
    );
  }

  const ratio = spent / limit;
  const state = ratio > 1 ? "over" : ratio >= WARN_AT ? "near" : "ok";
  const fill = { ok: "bg-expense", near: "bg-warning", over: "bg-critical" }[state];
  const remaining = limit - spent;

  return (
    <button
      type="button"
      onClick={startEditing}
      className="card animate-rise liftable w-full px-4 py-3.5 text-left"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink-2 text-xs font-medium">Hạn mức tháng</span>
        <span className="text-muted text-xs tabular-nums">
          {formatVND(spent)} / {formatVND(limit)}
        </span>
      </div>

      {/* Track là bước nhạt của chính ramp hồng để trạng thái đọc được trên cả thanh. */}
      <div
        className="bg-track mt-2 h-2.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Mức đã chi so với hạn mức"
      >
        {/* Lần đầu hiện thì mọc ngang bằng transform; các lần chi tiêu đổi sau đó
            chỉ chạy transition width nên không phải dựng lại animation. */}
        <div
          className={`animate-grow-x h-full rounded-full transition-[width] duration-500 ease-out ${fill}`}
          style={{ width: `${Math.min(100, Math.max(ratio * 100, spent > 0 ? 2 : 0))}%` }}
        />
      </div>

      <p
        className={`mt-2 text-xs font-medium ${
          state === "over"
            ? "text-critical"
            : state === "near"
              ? "text-ink-2"
              : "text-ink-2"
        }`}
      >
        {state === "over" ? (
          <>
            <span aria-hidden="true">⛔</span> Vượt hạn mức {formatVND(-remaining)}
          </>
        ) : state === "near" ? (
          <>
            <span aria-hidden="true">⚠️</span> Sắp chạm hạn mức — còn {formatVND(remaining)}
          </>
        ) : (
          <>
            <span aria-hidden="true">✅</span> Còn {formatVND(remaining)} có thể chi
          </>
        )}
      </p>
    </button>
  );
}
