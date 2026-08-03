"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDb } from "./firebase";
import { monthOf } from "./date";
import { byNewestFirst } from "./order";
import type { Transaction } from "./types";

export type TransactionDraft = Omit<Transaction, "id" | "month" | "createdAt">;

function txCollection(uid: string) {
  return collection(getDb(), "users", uid, "transactions");
}

/** Bỏ các field undefined — Firestore từ chối ghi undefined. */
function clean<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export async function addTransaction(uid: string, draft: TransactionDraft) {
  await addDoc(
    txCollection(uid),
    clean({ ...draft, month: monthOf(draft.date), createdAt: serverTimestamp() }),
  );
}

export async function updateTransaction(
  uid: string,
  id: string,
  draft: TransactionDraft,
) {
  await updateDoc(
    doc(txCollection(uid), id),
    clean({ ...draft, month: monthOf(draft.date) }),
  );
}

export async function deleteTransaction(uid: string, id: string) {
  await deleteDoc(doc(txCollection(uid), id));
}

export async function setBudget(uid: string, month: string, limit: number) {
  await setDoc(doc(getDb(), "users", uid, "budgets", month), { limit });
}

interface Loadable<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

const NO_TRANSACTIONS: Loadable<Transaction[]> = {
  data: [],
  loading: false,
  error: null,
};

const NO_BUDGET: Loadable<number | null> = { data: null, loading: false, error: null };

/**
 * Nghe realtime toàn bộ giao dịch của các tháng cho trước bằng MỘT listener.
 * Chỉ lọc trên `month` (một field) nên Firestore không đòi composite index;
 * việc sắp xếp làm ở client. Firestore giới hạn toán tử `in` ở 30 giá trị.
 */
export function useTransactions(
  uid: string | undefined,
  months: string[],
): Loadable<Transaction[]> {
  const [state, setState] = useState<Loadable<Transaction[]>>({
    data: [],
    loading: true,
    error: null,
  });
  const key = months.join(",");

  useEffect(() => {
    if (!uid) return;
    const list = key.split(",").filter(Boolean).slice(0, 30);
    if (list.length === 0) return;

    return onSnapshot(
      query(txCollection(uid), where("month", "in", list)),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Transaction);
        rows.sort(byNewestFirst);
        if (process.env.NODE_ENV === "development") {
          console.info(
            `[firestore] nhận ${rows.length} giao dịch cho ${list.join(", ")}`,
            rows.map((r) => `${r.month} ${r.amount} ${r.note}`),
          );
        }
        setState({ data: rows, loading: false, error: null });
      },
      (err) => setState({ data: [], loading: false, error: describeDbError(err) }),
    );
  }, [uid, key]);

  return uid && months.length > 0 ? state : NO_TRANSACTIONS;
}

/** Hạn mức chi tiêu của một tháng; null nghĩa là chưa đặt. */
export function useBudget(
  uid: string | undefined,
  month: string,
): Loadable<number | null> {
  const [state, setState] = useState<Loadable<number | null>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(getDb(), "users", uid, "budgets", month),
      (snap) => {
        const limit = snap.data()?.limit;
        setState({
          data: typeof limit === "number" ? limit : null,
          loading: false,
          error: null,
        });
      },
      (err) => setState({ data: null, loading: false, error: describeDbError(err) }),
    );
  }, [uid, month]);

  return uid ? state : NO_BUDGET;
}

function describeDbError(err: unknown): string {
  // In nguyên lỗi ra Console để còn đọc được mã lỗi gốc khi đi tìm nguyên nhân.
  console.error("[firestore]", err);
  const code = (err as { code?: string })?.code ?? "";
  if (code === "permission-denied") {
    return "Firestore từ chối truy cập. Kiểm tra đã Publish nội dung firestore.rules chưa (bước B7 trong CHECKLIST.md).";
  }
  if (code === "failed-precondition" || code === "unavailable") {
    return "Chưa tạo được Firestore Database, hoặc mất kết nối mạng.";
  }
  return `Lỗi đọc dữ liệu: ${code || String(err)}`;
}
