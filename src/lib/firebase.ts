import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

const options: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** false khi .env.local chưa được điền — UI dùng cờ này để hiện hướng dẫn thay vì crash. */
export const firebaseConfigured = Boolean(
  options.apiKey && options.projectId && options.appId,
);

function app() {
  return getApps().length ? getApp() : initializeApp(options);
}

/** Cho các module cần chính đối tượng app, vd getMessaging() ở lib/push.ts. */
export function getFirebaseApp() {
  return app();
}

let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;

export function getFirebaseAuth(): Auth {
  if (!cachedAuth) cachedAuth = getAuth(app());
  return cachedAuth;
}

/**
 * Firestore với cache nằm trên IndexedDB.
 *
 * Mặc định SDK chỉ giữ cache trong RAM: đóng tab là mất sạch, nên mỗi lần mở
 * app onSnapshot phải chờ trọn một vòng mạng mới có dữ liệu đầu tiên — trên 4G
 * là cả giây trắng trang dù giao dịch chẳng đổi gì. Cache trên đĩa cho snapshot
 * đầu tiên bật ra ngay từ những gì lần trước đã tải, rồi mới lặng lẽ đối chiếu
 * với server. Đổi tháng cũng vậy: query mới nhưng document đã có sẵn.
 *
 * Dùng bản nhiều tab vì bản một tab chỉ cho MỘT tab giữ cache, tab thứ hai bị
 * rơi về RAM — mà mở hai tab là chuyện thường.
 *
 * IndexedDB bị chặn (ẩn danh, Safari khoá) thì SDK tự quay về cache RAM và ghi
 * "Falling back to memory cache" ra Console; app vẫn chạy, chỉ chậm như cũ.
 */
export function getDb(): Firestore {
  if (cachedDb) return cachedDb;
  try {
    cachedDb = initializeFirestore(app(), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Firestore đã được khởi tạo trước đó — hay gặp nhất là khi Fast Refresh
    // nạp lại module này mà đối tượng app cũ vẫn còn sống.
    cachedDb = getFirestore(app());
  }
  return cachedDb;
}

export const googleProvider = new GoogleAuthProvider();
