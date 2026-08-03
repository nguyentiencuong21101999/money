"use client";

import { useEffect, useState } from "react";

/**
 * Mốc "bây giờ" dùng chung cho cả một danh sách, tự làm mới mỗi phút để chữ
 * "5 phút trước" không đứng hình khi người dùng để yên màn hình.
 *
 * Phải qua state chứ không gọi thẳng Date.now() trong thân component: gọi thẳng
 * là hàm không thuần, React có thể render lại lúc nào tuỳ nó và mỗi dòng trong
 * danh sách sẽ tính theo một mốc lệch nhau.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
