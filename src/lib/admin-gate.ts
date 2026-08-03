"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isAdminEmail } from "./admin";
import { useAuth } from "./auth";

/**
 * Đá về trang chủ nếu không phải admin. Trả về `true` khi được phép, để
 * component gọi nó biết có nên vẽ gì không.
 *
 * Đây CHỈ là rào giao diện — ai cũng gõ được URL và ai cũng sửa được biến trong
 * trình duyệt. Chỗ chặn thật là hàm isAdmin() trong firestore.rules: không có
 * nó thì người lạ vẫn moi được dữ liệu dù trang này không chịu vẽ ra.
 */
export function useAdminGate(): boolean {
  const { user } = useAuth();
  const router = useRouter();
  const allowed = isAdminEmail(user?.email);

  useEffect(() => {
    if (!allowed) router.replace("/");
  }, [allowed, router]);

  return allowed;
}
