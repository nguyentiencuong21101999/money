"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";
import { getDb } from "./firebase";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  isRead: boolean;
  /** Mốc gửi, tính bằng mili giây. null khi máy chủ chưa kịp đóng dấu giờ. */
  createdAt: number | null;
  /** Bấm vào thì đi đâu. Mặc định ở lại trang chủ. */
  link?: string;
}

/** Số thông báo hiện trong hộp thư ở chuông. */
export const BELL_COUNT = 10;

/** Trần của trang "xem tất cả" — đủ sâu cho một app cá nhân, khỏi phân trang. */
export const ALL_COUNT = 100;

/** Đếm quá số này thì badge hiện "99+", không cần biết chính xác là bao nhiêu. */
const UNREAD_CAP = 99;

function notiCollection(uid: string) {
  return collection(getDb(), "users", uid, "notifications");
}

/** serverTimestamp() đọc ra là Timestamp, không phải number — phải quy đổi. */
function millisOf(value: unknown): number | null {
  const stamp = value as Timestamp | null | undefined;
  return stamp && typeof stamp.toMillis === "function" ? stamp.toMillis() : null;
}

export interface Inbox {
  items: AppNotification[];
  /** Số chưa đọc, chặn ở 99 — xem `UNREAD_CAP`. */
  unread: number;
  loading: boolean;
  error: string | null;
}

/**
 * Nghe realtime `max` thông báo mới nhất, kèm số chưa đọc.
 *
 * Cố tình dùng HAI listener: danh sách bị giới hạn 10 cái nên không đếm được
 * số chưa đọc từ nó (chưa đọc thứ 11 trở đi sẽ mất tích). Query đếm chỉ lọc
 * trên một field và không sắp xếp nên Firestore không đòi composite index.
 */
export function useInbox(uid: string | undefined, max = BELL_COUNT): Inbox {
  const [state, setState] = useState<Inbox>({
    items: [],
    unread: 0,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!uid) return;

    const stopList = onSnapshot(
      query(notiCollection(uid), orderBy("createdAt", "desc"), limit(max)),
      (snap) => {
        const items = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: String(data.title ?? "Thông báo"),
            body: String(data.body ?? ""),
            isRead: data.isRead === true,
            createdAt: millisOf(data.createdAt),
            link: typeof data.link === "string" ? data.link : undefined,
          } satisfies AppNotification;
        });
        setState((s) => ({ ...s, items, loading: false, error: null }));
      },
      (err) => setState((s) => ({ ...s, loading: false, error: describe(err) })),
    );

    const stopUnread = onSnapshot(
      query(notiCollection(uid), where("isRead", "==", false), limit(UNREAD_CAP)),
      (snap) => setState((s) => ({ ...s, unread: snap.size })),
      (err) => setState((s) => ({ ...s, error: describe(err) })),
    );

    return () => {
      stopList();
      stopUnread();
    };
  }, [uid, max]);

  return uid ? state : { items: [], unread: 0, loading: false, error: null };
}

export async function markRead(uid: string, id: string) {
  await updateDoc(doc(notiCollection(uid), id), { isRead: true });
}

/** Đánh dấu đã đọc tất cả. Một batch tối đa 500 thao tác, nên cắt ở đó. */
export async function markAllRead(uid: string) {
  const { getDocs } = await import("firebase/firestore");
  const snap = await getDocs(
    query(notiCollection(uid), where("isRead", "==", false), limit(500)),
  );
  if (snap.empty) return;

  const batch = writeBatch(getDb());
  snap.docs.forEach((d) => batch.update(d.ref, { isRead: true }));
  await batch.commit();
}

function describe(err: unknown): string {
  console.error("[firestore] notifications", err);
  const code = (err as { code?: string })?.code ?? "";
  if (code === "permission-denied") {
    return "Firestore từ chối đọc thông báo. Kiểm tra đã Publish lại firestore.rules chưa.";
  }
  return `Không đọc được thông báo: ${code || String(err)}`;
}
