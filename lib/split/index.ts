// Tính chia tiền nhóm — code thuần, dùng chung cho máy và server (design D5).
// Mọi số tiền là số nguyên đồng. Không import gì để server (Node ESM) dùng thẳng được.

export interface SplitMember {
  id: string;
  /** Thời điểm thêm vào nhóm — quyết định ai nhận phần dư khi làm tròn, và thứ tự khi bằng nhau. */
  orderKey: number;
}

export interface SplitShare {
  memberId: string;
  weight: number;
}

export interface SplitItem {
  kind: "expense" | "settlement";
  amount: number;
  payerMemberId: string;
  /** Chỉ với dòng thanh toán: người nhận tiền. */
  toMemberId?: string | null;
  /** Chỉ với món chi tiêu: người cùng chia và số suất (bản chụp lúc ghi món). */
  shares?: SplitShare[] | null;
  deletedAt?: number | null;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

type Order = Map<string, number>;

function orderOf(members: readonly SplitMember[]): Order {
  return new Map(members.map((m) => [m.id, m.orderKey]));
}

/** So sánh theo thứ tự vào nhóm, rồi theo id — cho kết quả giống nhau trên mọi máy. */
function byOrder(order: Order) {
  return (a: string, b: string) => {
    const ka = order.get(a) ?? Number.MAX_SAFE_INTEGER;
    const kb = order.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (ka !== kb) return ka - kb;
    return a < b ? -1 : a > b ? 1 : 0;
  };
}

/**
 * Phần phải góp của từng người trong một món: tiền × suất / tổng suất, làm tròn xuống;
 * phần dư cộng từng đồng cho người vào nhóm sớm hơn. Tổng luôn bằng đúng `amount`.
 */
export function computeShares(amount: number, shares: readonly SplitShare[], members: readonly SplitMember[]): Map<string, number> {
  const out = new Map<string, number>();
  const valid = shares.filter((s) => s.weight > 0);
  const total = valid.reduce((sum, s) => sum + s.weight, 0);
  if (total === 0 || amount <= 0) return out;

  const ids = [...new Set(valid.map((s) => s.memberId))].sort(byOrder(orderOf(members)));
  const weight = new Map<string, number>();
  for (const s of valid) weight.set(s.memberId, (weight.get(s.memberId) ?? 0) + s.weight);

  let given = 0;
  for (const id of ids) {
    const part = Math.floor((amount * weight.get(id)!) / total);
    out.set(id, part);
    given += part;
  }
  // Phần dư luôn nhỏ hơn số người cùng chia, nên mỗi người nhận tối đa 1 đồng.
  for (let i = 0; given < amount; i = (i + 1) % ids.length) {
    out.set(ids[i], out.get(ids[i])! + 1);
    given++;
  }
  return out;
}

/**
 * Số dư mỗi thành viên: dương = được nhận, âm = cần trả.
 * = đã trả trong món + đã chuyển cho người khác − phần phải góp − đã nhận từ người khác.
 */
export function balances(members: readonly SplitMember[], items: readonly SplitItem[]): Map<string, number> {
  const out = new Map<string, number>(members.map((m) => [m.id, 0]));
  const add = (id: string, v: number) => out.set(id, (out.get(id) ?? 0) + v);
  for (const it of items) {
    if (it.deletedAt) continue;
    if (it.kind === "settlement") {
      if (!it.toMemberId) continue;
      add(it.payerMemberId, it.amount);
      add(it.toMemberId, -it.amount);
    } else {
      const parts = computeShares(it.amount, it.shares ?? [], members);
      if (parts.size === 0) continue;
      add(it.payerMemberId, it.amount);
      for (const [id, part] of parts) add(id, -part);
    }
  }
  return out;
}

/**
 * Các lần chuyển tiền để mọi người về 0: lần lượt ghép người cần trả nhiều nhất với người được nhận nhiều nhất.
 * Mỗi bước làm ít nhất một người về 0 → tối đa (số người khác 0) − 1 lần chuyển.
 */
export function settle(bal: ReadonlyMap<string, number>, members: readonly SplitMember[]): Transfer[] {
  const cmp = byOrder(orderOf(members));
  const left = new Map([...bal].filter(([, v]) => v !== 0));
  const pick = (sign: 1 | -1) =>
    [...left.keys()]
      .filter((id) => Math.sign(left.get(id)!) === sign)
      .sort((a, b) => Math.abs(left.get(b)!) - Math.abs(left.get(a)!) || cmp(a, b))[0];

  const out: Transfer[] = [];
  for (;;) {
    const from = pick(-1);
    const to = pick(1);
    if (from === undefined || to === undefined) break;
    const amount = Math.min(-left.get(from)!, left.get(to)!);
    out.push({ from, to, amount });
    for (const [id, v] of [
      [from, left.get(from)! + amount],
      [to, left.get(to)! - amount],
    ] as const) {
      if (v === 0) left.delete(id);
      else left.set(id, v);
    }
  }
  return out;
}

/** Nhóm "đã xong": có ít nhất một món chưa xoá và mọi người về 0. */
export function isSettled(bal: ReadonlyMap<string, number>, items: readonly SplitItem[]): boolean {
  return items.some((it) => !it.deletedAt && it.kind === "expense") && [...bal.values()].every((v) => v === 0);
}
