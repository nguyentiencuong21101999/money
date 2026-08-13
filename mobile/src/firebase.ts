import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
// Import từ "@firebase/auth" chứ KHÔNG phải "firebase/auth": package bọc ngoài
// `firebase` thiếu điều kiện "react-native" trong export map, nên TypeScript lấy
// khai báo kiểu của bản trình duyệt — bản đó không có getReactNativePersistence.
// Lúc chạy thì Metro vẫn đi tiếp vào @firebase/auth/dist/rn (đã kiểm bằng source
// map của bundle), và "firebase/auth" cũng chỉ là `export * from "@firebase/auth"`,
// nên đây vẫn đúng một module — không có chuyện hai bản Auth song song.
import {
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  type Auth,
} from "@firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Bản khởi tạo Firebase cho React Native.
 *
 * `metro.config.js` lái mọi import "./firebase" phát ra từ `../src/lib/` về đây,
 * nên `src/lib/call.ts` dùng chung được với web mà không phải sửa dòng nào.
 * Bản web đọc cấu hình qua `process.env.NEXT_PUBLIC_*` — thứ chỉ Next.js mới
 * thay lúc build; bên này dùng `EXPO_PUBLIC_*` (xem .env.example).
 *
 * PHẢI trỏ về ĐÚNG project Firebase mà web đang dùng, nếu không hai bên ghi vào
 * hai cơ sở dữ liệu khác nhau và không bao giờ thấy nhau.
 */
const options: FirebaseOptions = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

/** false khi mobile/.env chưa điền — màn đăng nhập dùng cờ này để báo thay vì crash. */
export const firebaseConfigured = Boolean(
  options.apiKey && options.projectId && options.appId,
);

function app() {
  return getApps().length ? getApp() : initializeApp(options);
}

export function getFirebaseApp() {
  return app();
}

let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;

/**
 * React Native không có localStorage nên mặc định Auth chỉ giữ phiên trong RAM:
 * đóng app là phải đăng nhập lại. `getReactNativePersistence` + AsyncStorage cho
 * phiên sống qua các lần mở app — trên máy dùng để chia sẻ camera thì đây là
 * khác biệt giữa "bật là chạy" và "lần nào cũng gõ mật khẩu".
 */
export function getFirebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  try {
    cachedAuth = initializeAuth(app(), {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Đã khởi tạo rồi (Fast Refresh nạp lại module) — lấy bản đang có.
    cachedAuth = getAuth(app());
  }
  return cachedAuth;
}

/**
 * Firestore bản thường, KHÔNG bật cache trên đĩa như bên web: bản web dùng
 * `persistentLocalCache` vì IndexedDB có sẵn trong trình duyệt, còn ở React
 * Native lớp đó không chạy. Signaling toàn là đọc/ghi thời gian thực nên cache
 * cũng chẳng giúp gì.
 */
export function getDb(): Firestore {
  if (!cachedDb) cachedDb = getFirestore(app());
  return cachedDb;
}
