"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  type DocumentData,
} from "firebase/firestore";
import { getDb } from "./firebase";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  /** Ngày tạo tài khoản, lấy từ Firebase Auth. */
  createdAt: number | null;
  /** Lần cuối mở app. */
  lastSeenAt: number | null;
}

function millisOf(value: unknown): number | null {
  const stamp = value as Timestamp | null | undefined;
  return stamp && typeof stamp.toMillis === "function" ? stamp.toMillis() : null;
}

function toProfile(uid: string, data: DocumentData | undefined): UserProfile {
  return {
    uid,
    email: String(data?.email ?? ""),
    displayName: String(data?.displayName ?? ""),
    photoURL: typeof data?.photoURL === "string" ? data.photoURL : null,
    createdAt: millisOf(data?.createdAt),
    lastSeenAt: millisOf(data?.lastSeenAt),
  };
}

/**
 * Ghi hồ sơ người dùng mỗi lần mở app. Firestore không có sẵn danh sách người
 * dùng — document `users/{uid}` trước giờ chưa từng tồn tại, chỉ có các
 * subcollection bên dưới nó, mà subcollection thì không hiện ra khi liệt kê
 * collection. Không ghi cái này thì trang /manager rỗng.
 */
export async function saveProfile(user: User): Promise<void> {
  const created = user.metadata.creationTime
    ? Date.parse(user.metadata.creationTime)
    : NaN;

  await setDoc(
    doc(getDb(), "users", user.uid),
    {
      email: user.email ?? "",
      displayName: user.displayName ?? "",
      photoURL: user.photoURL ?? null,
      // Lấy từ Auth chứ không phải lần ghi đầu tiên: ghi đè mỗi lần cũng ra
      // đúng một giá trị, và người dùng cũ vẫn có ngày tạo thật.
      ...(Number.isFinite(created) ? { createdAt: Timestamp.fromMillis(created) } : {}),
      lastSeenAt: serverTimestamp(),
    },
    { merge: true },
  );
}

interface Loadable<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

/**
 * Toàn bộ người dùng, cho trang /manager. Chỉ chạy khi `enabled` — gọi lúc
 * không phải admin thì rules từ chối và Console đầy lỗi đỏ vô ích.
 *
 * Sắp xếp ở client: dùng orderBy thì Firestore loại luôn document thiếu field
 * đó, mà hồ sơ cũ có thể chưa kịp có `createdAt`.
 */
export function useProfiles(enabled: boolean): Loadable<UserProfile[]> {
  const [state, setState] = useState<Loadable<UserProfile[]>>({
    data: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      collection(getDb(), "users"),
      (snap) => {
        const rows = snap.docs.map((d) => toProfile(d.id, d.data()));
        rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        setState({ data: rows, loading: false, error: null });
      },
      (err) => setState({ data: [], loading: false, error: describe(err) }),
    );
  }, [enabled]);

  return enabled ? state : { data: [], loading: false, error: null };
}

/** Hồ sơ của đúng một người, cho trang /manager/{uid}. */
export function useProfile(uid: string, enabled: boolean): Loadable<UserProfile | null> {
  const [state, setState] = useState<Loadable<UserProfile | null>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(getDb(), "users", uid),
      (snap) =>
        setState({
          data: snap.exists() ? toProfile(snap.id, snap.data()) : null,
          loading: false,
          error: null,
        }),
      (err) => setState({ data: null, loading: false, error: describe(err) }),
    );
  }, [uid, enabled]);

  return enabled ? state : { data: null, loading: false, error: null };
}

function describe(err: unknown): string {
  console.error("[firestore] profiles", err);
  const code = (err as { code?: string })?.code ?? "";
  if (code === "permission-denied") {
    return "Firestore từ chối. Kiểm tra đã Publish lại firestore.rules với hàm isAdmin() chưa.";
  }
  return `Không đọc được danh sách người dùng: ${code || String(err)}`;
}
