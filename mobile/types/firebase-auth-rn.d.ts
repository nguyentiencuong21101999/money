import type { Persistence } from "@firebase/auth";

/**
 * Vá KIỂU cho `getReactNativePersistence` — hàm này có thật lúc chạy nhưng
 * TypeScript không nhìn thấy.
 *
 * Nguyên nhân là lỗi đóng gói của Firebase, không phải cấu hình dự án sai:
 * trong export map của `@firebase/auth`, khoá `"types"` (trỏ tới bản trình
 * duyệt) đứng TRƯỚC khoá `"react-native"`. Điều kiện khớp đầu tiên là thắng,
 * nên TypeScript luôn lấy khai báo của bản trình duyệt — bản không có hàm này.
 * `customConditions: ["react-native"]` mà expo/tsconfig.base đặt sẵn cũng không
 * cứu được, vì `"types"` đã khớp trước rồi.
 *
 * Lúc chạy thì đúng: đã kiểm bằng source map của bundle iOS, Metro nạp
 * `@firebase/auth/dist/rn` chứ không phải bản trình duyệt.
 *
 * Kiểm lại khi nâng firebase: nếu Firebase sửa thứ tự export map thì xoá file
 * này đi — TypeScript sẽ báo trùng khai báo nếu nó thành thừa.
 */
declare module "@firebase/auth" {
  /**
   * Giữ phiên đăng nhập qua các lần mở app. React Native không có localStorage
   * nên thiếu cái này là mỗi lần mở app phải gõ lại mật khẩu.
   */
  export function getReactNativePersistence(storage: {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
  }): Persistence;
}
