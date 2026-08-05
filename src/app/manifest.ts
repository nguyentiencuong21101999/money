import type { MetadataRoute } from "next";

/**
 * Cho phép "Thêm vào màn hình chính" trên điện thoại chạy như app thật:
 * mở toàn màn hình, không có thanh địa chỉ trình duyệt.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sổ tiền — ghi thu chi cá nhân",
    short_name: "Sổ tiền",
    description: "Sổ thu chi cá nhân. Chụp hoá đơn là có ngay số tiền.",
    lang: "vi",
    start_url: "/",
    display: "standalone",
    background_color: "#f6ecfb",
    theme_color: "#86198f",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
