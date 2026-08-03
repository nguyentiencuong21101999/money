"use client";

import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { deleteToken, getMessaging, getToken, isSupported } from "firebase/messaging";
import { getDb, getFirebaseApp } from "./firebase";

/** Console > Project settings > Cloud Messaging > Web Push certificates. */
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

/** Phải nằm ở gốc domain — xem public/firebase-messaging-sw.js. */
const SW_URL = "/firebase-messaging-sw.js";

/** Chưa điền VAPID key thì tính năng coi như chưa tồn tại, UI giấu luôn đi. */
export const pushConfigured = Boolean(VAPID_KEY);

export type PushState =
  /** Trình duyệt không làm được, hoặc chưa cấu hình VAPID key. */
  | "unsupported"
  /** Người dùng đã bấm Chặn — trình duyệt không cho hỏi lại, phải vào cài đặt. */
  | "blocked"
  /** Làm được nhưng chưa bật. */
  | "off"
  | "on";

async function usable(): Promise<boolean> {
  if (!VAPID_KEY || typeof window === "undefined") return false;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;
  // isSupported() bắt luôn các trường hợp khó đoán: Safari cũ, iOS chưa "Thêm
  // vào màn hình chính", trình duyệt trong ứng dụng khác (Facebook, Zalo).
  return await isSupported();
}

/** Token là chuỗi base64url nên gần như không có "/", nhưng id document thì cấm hẳn. */
function deviceId(token: string): string {
  return token.replace(/\//g, "_");
}

async function tokenFor(uid: string, save: boolean): Promise<string | null> {
  const registration = await navigator.serviceWorker.register(SW_URL);
  const token = await getToken(getMessaging(getFirebaseApp()), {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) return null;

  if (save) {
    // Lấy chính token làm id: đăng nhập lại bao nhiêu lần cũng chỉ một bản ghi
    // cho mỗi máy, không đẻ ra một đống doc rác trùng nhau.
    await setDoc(doc(getDb(), "users", uid, "devices", deviceId(token)), {
      token,
      userAgent: navigator.userAgent,
      updatedAt: serverTimestamp(),
    });
  }
  return token;
}

export async function pushState(): Promise<PushState> {
  if (!(await usable())) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return Notification.permission === "granted" ? "on" : "off";
}

/**
 * Gọi sau khi đăng nhập. Đã có quyền từ trước thì lặng lẽ làm mới token (token
 * có thể bị Firebase xoay, và máy này có thể chưa từng lưu vào tài khoản này).
 * Chưa có quyền thì KHÔNG hỏi — để dành cho nút "Bật thông báo" bấm tay.
 */
export async function syncPush(uid: string): Promise<void> {
  if (!(await usable()) || Notification.permission !== "granted") return;
  await tokenFor(uid, true);
}

/** Người dùng bấm nút "Bật thông báo" — chỗ duy nhất được phép hỏi quyền. */
export async function enablePush(uid: string): Promise<PushState> {
  if (!(await usable())) return "unsupported";

  const permission = await Notification.requestPermission();
  if (permission === "denied") return "blocked";
  if (permission !== "granted") return "off";

  return (await tokenFor(uid, true)) ? "on" : "off";
}

/**
 * Gọi TRƯỚC signOut(). Đăng xuất xong mới xoá thì rules chặn ghi, doc token
 * nằm lại vĩnh viễn và máy chủ vẫn đẩy thông báo về máy đã đăng xuất.
 */
export async function disablePush(uid: string): Promise<void> {
  if (!(await usable()) || Notification.permission !== "granted") return;

  const token = await tokenFor(uid, false);
  if (token) await deleteDoc(doc(getDb(), "users", uid, "devices", deviceId(token)));
  await deleteToken(getMessaging(getFirebaseApp()));
}
