import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  // template để trang con tự nối đuôi, vd "Sao kê · Sổ tiền"
  title: { default: "Sổ tiền", template: "%s · Sổ tiền" },
  description: "Sổ thu chi cá nhân. Chụp hoá đơn là có ngay số tiền.",
  applicationName: "Sổ tiền",
  appleWebApp: {
    capable: true,
    title: "Sổ tiền",
    statusBarStyle: "default",
  },
  // App riêng tư, không có lý do gì để lọt lên kết quả tìm kiếm.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Khớp màu nền trang để thanh trạng thái trên điện thoại liền mạch với app.
  themeColor: "#faf5f7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="h-full">
      <body className="min-h-full">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
