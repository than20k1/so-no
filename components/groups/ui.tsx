"use client";

// Mảnh giao diện dùng chung cho các màn Chia tiền.
import { useEffect, useRef, type ReactNode } from "react";
import { formatMoney, MAX_AMOUNT, parseAmount, toThousandsInput } from "@/lib/money";
import { MinusIcon, PlusIcon } from "../icons";

/** Trang chi tiết nhóm — toast hiện ở đây sau khi quay lại từ màn món. */
export const GROUP_PATH = "/chia-tien/nhom/";

export const card = "rounded-2xl border border-line bg-surface";
export const input =
  "min-h-12 w-full rounded-2xl border-2 border-line bg-surface px-4 text-[16px] outline-none focus:border-foreground";
export const primaryBtn =
  "min-h-12 rounded-2xl bg-foreground px-4 text-[16px] font-semibold text-background active:opacity-80 disabled:opacity-40";
export const secondaryBtn = "min-h-12 rounded-2xl border border-line px-4 text-[16px] font-semibold active:bg-line disabled:opacity-40";
export const dangerBtn = "min-h-12 rounded-2xl border border-add/50 px-4 text-[16px] font-semibold text-add active:bg-line";

/** Chọn số suất 1–20 bằng hai nút −/+ (dễ bấm hơn gõ số). */
export function WeightStepper({
  value,
  onChange,
  label,
  min = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  min?: number;
}) {
  const btn = "grid size-11 place-items-center rounded-full border border-line active:bg-line disabled:opacity-30";
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" aria-label={`${label} −`} className={btn} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <MinusIcon width={18} height={18} />
      </button>
      <span className="tabular w-7 text-center text-[16px] font-semibold" aria-live="polite">
        {value}
      </span>
      <button type="button" aria-label={`${label} +`} className={btn} disabled={value >= 20} onClick={() => onChange(value + 1)}>
        <PlusIcon width={18} height={18} />
      </button>
    </div>
  );
}

const QUICK = [10_000, 20_000, 50_000, 100_000, 200_000, 500_000];

/**
 * Ô số tiền kiểu chợ giống màn Ghi nợ: gõ theo nghìn (54 → 54.000), có nút cộng nhanh.
 * `value` là số đồng chính xác (có thể lẻ, vd. điền sẵn 33.334 khi đánh dấu đã trả).
 */
export function AmountField({
  id,
  label,
  hint,
  value,
  onChange,
  autoFocus,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  autoFocus?: boolean;
}) {
  const text = toThousandsInput(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium text-muted">
          {label}
        </label>
        <span className="text-xs text-muted">{hint}</span>
      </div>
      <div className="flex items-center rounded-2xl border-2 border-line bg-surface px-4 focus-within:border-foreground">
        <input
          ref={ref}
          id={id}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          enterKeyHint="done"
          value={text}
          onChange={(e) => onChange(parseAmount(e.target.value.replace(/\D/g, "").slice(0, 7)))}
          placeholder="0"
          className="tabular min-h-16 w-full min-w-0 bg-transparent text-3xl font-bold outline-none"
        />
        <span className="tabular shrink-0 text-2xl font-bold text-muted">.000</span>
      </div>
      <div className="tabular text-right text-lg font-semibold" data-testid={`${id}-preview`} aria-live="polite">
        {formatMoney(value)}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {QUICK.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(Math.min(value + v, MAX_AMOUNT))}
            className="min-h-12 rounded-xl border border-line bg-surface text-[16px] font-semibold active:bg-line"
          >
            +{v / 1000}k
          </button>
        ))}
      </div>
    </div>
  );
}

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "strong" }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
        tone === "strong" ? "bg-foreground text-background" : "bg-line text-muted"
      }`}
    >
      {children}
    </span>
  );
}

/** Thông báo lỗi nhỏ dưới form. */
export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-900" data-testid="group-error">
      {children}
    </p>
  );
}

/** Bảng trượt từ dưới lên (mời bạn, xác nhận...). */
export function Sheet({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" aria-label="×" tabIndex={-1} className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative mx-auto flex max-h-[90dvh] w-full max-w-[480px] flex-col gap-3 overflow-y-auto rounded-t-3xl bg-background p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  );
}
