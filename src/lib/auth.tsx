"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { firebaseConfigured, getFirebaseAuth, googleProvider } from "./firebase";
import { saveProfile } from "./profile";
import { disablePush, syncPush } from "./push";

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Hoãn một việc nền tới lúc trình duyệt rảnh tay.
 *
 * Đăng ký service worker, xin token FCM và ghi hồ sơ đều là việc không ai đứng
 * chờ, nhưng chạy ngay khi vừa đăng nhập thì chúng giành CPU và băng thông với
 * đúng cái query đang làm người dùng nhìn màn hình trống. `timeout` để máy lúc
 * nào cũng bận thì vẫn có lúc chạy, chứ không hoãn vô thời hạn.
 */
function whenIdle(run: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 3_000 });
  } else {
    // Safari chưa có requestIdleCallback — canh sau lần vẽ đầu tiên là đủ.
    setTimeout(run, 1_500);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured);
  /*
    Đang trong lượt bấm đăng nhập. Tách khỏi `loading` vì `loading` chỉ phủ lượt
    kiểm tra phiên lúc mở app, xong là tắt vĩnh viễn.

    Không có cờ này thì có một quãng hở: popup Google đã đóng nhưng Firebase còn
    đang đổi mã lấy token với máy chủ — một vòng gọi mạng. Suốt quãng đó `user`
    vẫn null nên màn đăng nhập hiện LẠI một nhịp, rồi mới nhảy sang màn chờ.
  */
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    return onAuthStateChanged(getFirebaseAuth(), (u) => {
      setUser(u);
      setLoading(false);
      /*
        Tắt vô điều kiện, kể cả khi u là null. Nếu chỉ tắt lúc có user thì một
        lần bắn null bất thường sẽ khiến app kẹt ở màn chờ vĩnh viễn — hỏng nặng
        hơn nhiều so với việc màn đăng nhập loé lên một nhịp.
      */
      setSigningIn(false);
      // Bắt ở đây chứ không ở signIn(): chỗ này chạy cho cả lần bấm đăng nhập
      // lẫn lần mở lại app với phiên cũ, nên token xoay lúc nào cũng được ghi lại.
      // Chạy nền và nuốt lỗi — thông báo hỏng thì cũng không được cản đăng nhập.
      // Xem whenIdle: nhường đường cho lượt tải dữ liệu trước đã.
      if (u) {
        whenIdle(() => {
          void syncPush(u.uid).catch((e) => console.error("[push] sync", e));
          // Hồ sơ cho trang quản lý. Cũng chạy nền, hỏng thì thôi.
          void saveProfile(u).catch((e) => console.error("[profile] save", e));
        });
      }
    });
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading: loading || signingIn,
      error,
      async signIn() {
        setError(null);
        setSigningIn(true);
        try {
          // Token thông báo do onAuthStateChanged ở trên lo, không gọi lại ở đây.
          await signInWithPopup(getFirebaseAuth(), googleProvider);
          /*
            CỐ Ý không tắt signingIn ở đây. Hàm này trả về xong thì user vẫn
            chưa vào state — phải đợi onAuthStateChanged bắn. Tắt ngay tại đây
            là mở lại đúng cái quãng hở mà cờ này sinh ra để bịt.
          */
        } catch (e) {
          setError(describeAuthError(e));
          // Bấm huỷ / đóng popup thì phải trả người dùng về màn đăng nhập.
          setSigningIn(false);
        }
      },
      async signOutUser() {
        // Xoá token TRƯỚC khi đăng xuất, xong rồi thì rules không cho ghi nữa.
        // Hỏng cũng vẫn phải đăng xuất được — không ai chịu cảnh kẹt lại trong app.
        if (user) {
          try {
            await disablePush(user.uid);
          } catch (e) {
            console.error("[push] disable", e);
          }
        }
        await signOut(getFirebaseAuth());
      },
    }),
    [user, loading, signingIn, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải nằm trong <AuthProvider>");
  return ctx;
}

function describeAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return "Bạn đã đóng cửa sổ đăng nhập.";
  }
  if (code === "auth/popup-blocked") {
    return "Trình duyệt chặn cửa sổ pop-up. Hãy cho phép pop-up cho localhost rồi thử lại.";
  }
  if (code === "auth/unauthorized-domain") {
    return "Domain chưa được cho phép. Vào Firebase Console > Authentication > Settings > Authorized domains và thêm domain này.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Chưa bật đăng nhập Google. Vào Firebase Console > Authentication > Sign-in method > bật Google.";
  }
  if (code === "auth/configuration-not-found") {
    return "Chưa bật Authentication trong Firebase Console (bước B3 trong CHECKLIST.md).";
  }
  return `Đăng nhập thất bại: ${code || String(e)}`;
}
