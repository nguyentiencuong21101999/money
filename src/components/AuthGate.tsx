"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { firebaseConfigured } from "@/lib/firebase";
import { Logo } from "./Logo";

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading, error, signIn } = useAuth();

  if (!firebaseConfigured) return <SetupNotice />;

  if (loading) {
    return (
      <Centered>
        {/* Chỉ icon thở nhẹ — F5 xong thấy ngay nhận diện quen thuộc,
            không phải một câu thông báo kỹ thuật. */}
        <span role="status" aria-label="Đang tải" className="animate-breathe">
          <Logo size={64} />
        </span>
      </Centered>
    );
  }

  if (!user) {
    return (
      <Centered>
        <div className="card animate-pop w-full max-w-sm p-8 text-center">
          <span className="mx-auto block w-fit">
            <Logo size={64} />
          </span>
          <h1 className="mt-4 text-xl font-semibold">Sổ tiền</h1>
          <p className="text-ink-2 mt-1.5 text-sm leading-relaxed">
            Chụp hoá đơn là có ngay số tiền,
            <br />
            hoặc gõ tay cũng được.
          </p>
          <button
            type="button"
            onClick={signIn}
            className="border-hairline hover:border-expense/40 hover:bg-expense/8 mt-6 flex w-full items-center justify-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium transition active:scale-[0.98]"
          >
            <GoogleMark />
            Đăng nhập bằng Google
          </button>
          {error && (
            <p className="border-critical/40 bg-critical/6 text-critical animate-rise mt-4 rounded-lg border px-3 py-2 text-left text-sm">
              {error}
            </p>
          )}
        </div>
      </Centered>
    );
  }

  return <>{children}</>;
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-5">{children}</div>
  );
}

function SetupNotice() {
  return (
    <Centered>
      <div className="card w-full max-w-lg p-7">
        <h1 className="text-lg font-semibold">Chưa cấu hình Firebase</h1>
        <p className="text-ink-2 mt-2 text-sm">
          App đã chạy được rồi, chỉ còn thiếu key. Mở file{" "}
          <code className="rounded bg-black/6 px-1.5 py-0.5">CHECKLIST.md</code> ở
          thư mục dự án và làm mục <strong>B</strong>:
        </p>
        <ol className="text-ink-2 mt-4 list-decimal space-y-1.5 pl-5 text-sm">
          <li>
            Lấy Gemini API key ở{" "}
            <a
              className="text-expense underline"
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
            >
              aistudio.google.com/apikey
            </a>
          </li>
          <li>
            Tạo project ở{" "}
            <a
              className="text-expense underline"
              href="https://console.firebase.google.com"
              target="_blank"
              rel="noreferrer"
            >
              console.firebase.google.com
            </a>{" "}
            → bật Authentication (Google) + tạo Firestore Database
          </li>
          <li>
            Copy <code className="rounded bg-black/6 px-1.5 py-0.5">.env.local.example</code>{" "}
            thành <code className="rounded bg-black/6 px-1.5 py-0.5">.env.local</code>{" "}
            rồi điền 7 giá trị
          </li>
          <li>
            Tắt server và chạy lại{" "}
            <code className="rounded bg-black/6 px-1.5 py-0.5">npm run dev</code>
          </li>
        </ol>
      </div>
    </Centered>
  );
}

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.8-2 5.1-4.4 6.7v5.6h7.1c4.2-3.8 6.6-9.5 6.6-16.5z"
      />
      <path
        fill="#34A853"
        d="M24 46c6 0 11-2 14.6-5.4l-7.1-5.6c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.7-3.9-12.4-9.1H4.3v5.8C7.9 41.1 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.6 28c-.4-1.3-.7-2.6-.7-4s.3-2.7.7-4v-5.8H4.3A22 22 0 0 0 2 24c0 3.6.9 6.9 2.3 9.8l7.3-5.8z"
      />
      <path
        fill="#EA4335"
        d="M24 10.8c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 4.2 30 2 24 2 15.4 2 7.9 6.9 4.3 14.2l7.3 5.8c1.7-5.2 6.6-9.2 12.4-9.2z"
      />
    </svg>
  );
}
