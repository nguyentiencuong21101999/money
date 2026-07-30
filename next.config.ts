import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            // Trang đăng nhập của Google đặt COOP same-origin, làm đứt liên kết
            // opener → Firebase không đọc được popup.closed và Chrome log lỗi đỏ.
            // Giá trị này giữ liên kết với popup do chính trang mình mở.
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
