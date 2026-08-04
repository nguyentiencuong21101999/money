"use client";

import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDb, getFirebaseApp } from "./firebase";

/**
 * `firebase/messaging` nặng cỡ 30KB gzip mà chỉ cần khi thật sự chạm tới thông
 * báo đẩy. Import động để nó rời khỏi gói JS của lần tải trang đầu — mọi nơi
 * gọi tới nó đều là việc chạy nền hoặc sau một cú bấm, chậm thêm một nhịp tải
 * module thì không ai thấy.
 */
function messaging() {
  return import("firebase/messaging");
}

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
  // Hai phép thử rẻ tiền này đứng trước import động là có ý: máy nào không đỡ
  // được thông báo thì khỏi phải tải cả module messaging về rồi bỏ đó.
  if (!VAPID_KEY || typeof window === "undefined") return false;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;
  // isSupported() bắt luôn các trường hợp khó đoán: Safari cũ, iOS chưa "Thêm
  // vào màn hình chính", trình duyệt trong ứng dụng khác (Facebook, Zalo).
  const { isSupported } = await messaging();
  return await isSupported();
}

const DEVICE_KEY = "so-tien:device-id";

/**
 * Cờ "người dùng chủ động tắt". Cần cờ riêng vì bấm Tắt trong app không thu hồi
 * được quyền của trình duyệt — quyền vẫn là "đã cho phép", nên nếu chỉ xoá token
 * thì lần mở app sau syncPush() thấy có quyền là đăng ký lại, bật lên như cũ.
 */
const OFF_KEY = "so-tien:push-off";

function optedOut(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) === "1";
  } catch {
    return false;
  }
}

function setOptedOut(off: boolean) {
  try {
    if (off) localStorage.setItem(OFF_KEY, "1");
    else localStorage.removeItem(OFF_KEY);
  } catch {
    // Trình duyệt chặn localStorage thì thôi, không đáng để hỏng cả luồng.
  }
}

/**
 * Mã máy cố định, KHÔNG dùng token làm id document.
 *
 * Token chết mỗi khi người dùng tắt rồi bật lại quyền thông báo, hoặc khi
 * Firebase tự xoay; lấy token làm id thì mỗi lần như vậy lại đẻ thêm một doc,
 * doc cũ trỏ tới token đã chết nằm lại vĩnh viễn. Neo theo máy thì bật tắt bao
 * nhiêu lần cũng chỉ một doc, token mới ghi đè token cũ.
 */
function deviceId(): string {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved) return saved;
    const fresh = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    // Chế độ ẩn danh hoặc trình duyệt chặn localStorage: chịu cảnh mỗi phiên
    // một doc, vẫn hơn là hỏng hẳn.
    return crypto.randomUUID();
  }
}

function deviceDoc(uid: string) {
  return doc(getDb(), "users", uid, "devices", deviceId());
}

/**
 * Nhãn kiểu "Chrome trên macOS" để mở Console ra là biết doc này của máy nào.
 * Chỉ để người đọc, đừng dùng nó làm khoá: hai cửa sổ Chrome trên cùng một máy
 * cho ra nhãn y hệt nhau — muốn phân biệt thì nhìn id document (mã máy).
 */
function deviceLabel(): string {
  const ua = navigator.userAgent;

  // Thứ tự quan trọng: Chrome/Edge/Opera đều nhét "Safari" vào userAgent, còn
  // Chrome trên iPhone thì tự xưng là "CriOS" chứ không phải "Chrome".
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /CriOS\//.test(ua) || /Chrome\//.test(ua)
        ? "Chrome"
        : /FxiOS\//.test(ua) || /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Trình duyệt khác";

  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Macintosh/.test(ua)
          ? "macOS"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "máy khác";

  // Mở từ icon màn hình chính hay mở trong trình duyệt là hai lượt đăng ký
  // khác nhau, hai token khác nhau — nên phải phân biệt được trong danh sách.
  const installed = window.matchMedia?.("(display-mode: standalone)").matches;
  return `${browser} trên ${os}${installed ? " (app đã cài)" : ""}`;
}

async function saveToken(uid: string): Promise<string | null> {
  // Tải module và đăng ký service worker song song — hai việc không phụ thuộc
  // nhau, xếp hàng chờ nhau chỉ tốn thêm thời gian.
  const [{ getMessaging, getToken }, registration] = await Promise.all([
    messaging(),
    navigator.serviceWorker.register(SW_URL),
  ]);
  const token = await getToken(getMessaging(getFirebaseApp()), {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) return null;

  await setDoc(deviceDoc(uid), {
    token,
    label: deviceLabel(),
    userAgent: navigator.userAgent,
    // Lần cuối máy này còn sống. Doc nào cũ hàng tháng là máy đã bỏ đi.
    updatedAt: serverTimestamp(),
  });
  return token;
}

/**
 * Nghe người dùng gạt công tắc thông báo trong cài đặt của trình duyệt.
 * Trả về hàm huỷ nghe. Trình duyệt không có Permissions API thì thành no-op —
 * lúc đó trạng thái chỉ cập nhật khi tải lại trang, chấp nhận được.
 */
export function watchPermission(onChange: () => void): () => void {
  if (typeof navigator === "undefined" || !navigator.permissions) return () => {};

  let status: PermissionStatus | null = null;
  let cancelled = false;

  navigator.permissions
    .query({ name: "notifications" as PermissionName })
    .then((s) => {
      if (cancelled) return;
      status = s;
      s.addEventListener("change", onChange);
    })
    .catch(() => {});

  return () => {
    cancelled = true;
    status?.removeEventListener("change", onChange);
  };
}

export async function pushState(): Promise<PushState> {
  if (!(await usable())) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return Notification.permission === "granted" && !optedOut() ? "on" : "off";
}

/**
 * Gọi sau khi đăng nhập. Đã có quyền từ trước thì lặng lẽ làm mới token (token
 * có thể bị Firebase xoay, và máy này có thể chưa từng lưu vào tài khoản này).
 * Chưa có quyền thì KHÔNG hỏi — để dành cho nút "Bật thông báo" bấm tay.
 *
 * Mất quyền (người dùng tắt trong cài đặt trình duyệt) thì dọn luôn doc của máy
 * này: token đó đã chết, giữ lại chỉ tổ để máy chủ gửi vào hư không.
 */
export async function syncPush(uid: string): Promise<void> {
  if (!(await usable())) return;
  if (Notification.permission !== "granted" || optedOut()) {
    await deleteDoc(deviceDoc(uid));
    return;
  }
  await saveToken(uid);
}

/** Người dùng bấm nút "Bật thông báo" — chỗ duy nhất được phép hỏi quyền. */
export async function enablePush(uid: string): Promise<PushState> {
  if (!(await usable())) return "unsupported";

  const permission = await Notification.requestPermission();
  if (permission === "denied") return "blocked";
  if (permission !== "granted") return "off";

  setOptedOut(false);
  return (await saveToken(uid)) ? "on" : "off";
}

/**
 * Người dùng bấm nút "Tắt". Nhớ lựa chọn này lại để lần mở app sau không tự
 * bật lên — quyền của trình duyệt vẫn còn nên bấm Bật lại là chạy ngay, không
 * phải xin quyền lần nữa.
 */
export async function turnOffPush(uid: string): Promise<PushState> {
  setOptedOut(true);
  await disablePush(uid);
  return "off";
}

/**
 * Gọi TRƯỚC signOut(). Đăng xuất xong mới xoá thì rules chặn ghi, doc token
 * nằm lại vĩnh viễn và máy chủ vẫn đẩy thông báo về máy đã đăng xuất.
 */
export async function disablePush(uid: string): Promise<void> {
  if (!(await usable())) return;

  await deleteDoc(deviceDoc(uid));
  // Huỷ luôn token phía Firebase, không thì máy chủ vẫn coi máy này còn sống.
  if (Notification.permission === "granted") {
    const { deleteToken, getMessaging } = await messaging();
    await deleteToken(getMessaging(getFirebaseApp()));
  }
}
