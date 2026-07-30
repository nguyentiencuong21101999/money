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

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    return onAuthStateChanged(getFirebaseAuth(), (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      error,
      async signIn() {
        setError(null);
        try {
          await signInWithPopup(getFirebaseAuth(), googleProvider);
        } catch (e) {
          setError(describeAuthError(e));
        }
      },
      async signOutUser() {
        await signOut(getFirebaseAuth());
      },
    }),
    [user, loading, error],
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
