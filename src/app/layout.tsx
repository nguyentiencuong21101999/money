import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ScrollTopButton } from "@/components/ScrollTopButton";

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
  // Lấy màu ở ĐỈNH trang, nơi vệt tím phủ đậm nhất (đo bằng scripts/validate-palette.mjs),
  // chứ không lấy màu nền trơn — thanh trạng thái nằm sát mép trên, phải khớp
  // với đúng chỗ nó chạm vào.
  themeColor: "#d8a6ee",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="h-full">
      <head>
        {/* Bắt tay DNS + TLS với Google ngay từ lúc trình duyệt còn đang tải JS,
            thay vì đợi Firebase khởi động xong mới bắt đầu. Trên 4G mỗi lần bắt
            tay là 200-400ms, mà đây là ba host nằm thẳng trên đường tới dữ liệu:
            firestore đọc giao dịch, securetoken làm mới token phiên cũ,
            identitytoolkit lo lượt đăng nhập. */}
        <link rel="preconnect" href="https://firestore.googleapis.com" crossOrigin="anonymous" />
        <link
          rel="preconnect"
          href="https://securetoken.googleapis.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://identitytoolkit.googleapis.com"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-full">
        <AuthProvider>{children}</AuthProvider>
        {/*
          Đặt ở layout gốc nên có mặt ở MỌI trang, khỏi phải gắn tay từng chỗ và
          khỏi lỡ một trang nào. Nút tự ẩn khi chưa cuộn quá một màn hình, nên ở
          trang ngắn hay màn đăng nhập nó không vẽ gì cả.

          Nằm NGOÀI AuthProvider vì nó chỉ đọc vị trí cuộn, không cần biết ai đang
          đăng nhập. z-30 nên các lớp phủ (sheet z-50, viewer z-60, popup xác nhận
          z-70) đều che được nó.
        */}
        <ScrollTopButton />
      </body>
    </html>
  );
}
