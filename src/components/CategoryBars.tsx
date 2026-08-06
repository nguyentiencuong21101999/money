"use client";

import { iconFor } from "@/lib/categories";
import { formatVND } from "@/lib/money";
import type { CategorySlice } from "@/lib/stats";

/**
 * Chi tiêu theo danh mục — thanh ngang xếp giảm dần, MỘT màu duy nhất.
 * Độ dài thanh đã mã hoá độ lớn rồi nên không tô mỗi danh mục một màu
 * (9 danh mục vượt trần 8 slot của bảng màu và sẽ lẫn nhau khi nhìn màu).
 *
 * Bề rộng thanh = ĐÚNG con số % ghi bên cạnh. Trước đây vẽ theo tỉ lệ với danh
 * mục lớn nhất nên danh mục đầu luôn đầy 100% dù nhãn ghi 74% — hai cách mã hoá
 * khác nhau nằm cạnh nhau, đọc là thấy sai ngay.
 */
interface Props {
  slices: CategorySlice[];
  /**
   * Tiêu đề thẻ. Có prop này để trang sao kê dùng LẠI đúng component thay vì tự
   * vẽ lại thanh — trước đây nó nhân bản markup và hai bên lệch nhau: home dùng
   * bar-fill (dải màu), sao kê dùng bg-expense (một màu đặc), cùng một widget mà
   * hai bộ mặt. Nhân bản là nguyên nhân, không phải màu.
   */
  title?: string;
  emptyText?: string;
}

export function CategoryBars({
  slices,
  title = "Chi theo danh mục",
  emptyText = "Tháng này chưa có khoản chi nào.",
}: Props) {
  if (slices.length === 0) {
    return (
      <Card title={title}>
        <p className="text-muted py-6 text-center text-sm">{emptyText}</p>
      </Card>
    );
  }

  return (
    <Card title={title}>
      {/* space nhỏ lại vì mỗi dòng đã tự có py-1 cho vùng hover — tổng nhịp giữ nguyên */}
      <ul className="mt-3 space-y-0.5">
        {slices.map((slice, index) => (
          <li
            key={slice.category}
            /* Nền hover rất nhạt: đủ để mắt bám dòng khi dò số, nhưng KHÔNG có
               con trỏ tay và KHÔNG có vành gradient — dòng này không bấm được,
               cho nó bộ mặt của nút là hứa hẹn một hành động không tồn tại.
               Đây là ngoại lệ có chủ ý so với quy tắc "hover thì có nền + viền"
               áp cho mọi thứ bấm được trong app. */
            className="hover:bg-expense/8 -mx-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-lg px-1.5 py-1 transition-colors"
          >
            <span className="flex min-w-0 items-center gap-1.5 text-sm">
              <span aria-hidden="true">{iconFor(slice.category)}</span>
              <span className="truncate">{slice.category}</span>
            </span>
            <span className="text-ink-2 text-sm font-medium tabular-nums">
              {formatVND(slice.total)}
              <span className="text-muted ml-1.5 font-normal">
                {Math.round(slice.share * 100)}%
              </span>
            </span>
            <span className="col-span-2 block h-2.5">
              <span
                className="bar-fill animate-grow-x block h-full rounded-r"
                style={{
                  width: `${Math.max(1.5, slice.share * 100)}%`,
                  /* So le nhẹ để mắt đọc thứ tự giảm dần; chặn trần 300ms
                     kẻo danh mục cuối mọc quá trễ so với lúc thẻ hiện ra. */
                  animationDelay: `${Math.min(index * 45, 300)}ms`,
                }}
              />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card animate-rise p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}
