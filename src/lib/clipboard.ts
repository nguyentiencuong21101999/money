/**
 * Lấy file ảnh đầu tiên từ sự kiện dán hoặc kéo-thả.
 * Trả về null nếu người dùng dán chữ, dán file không phải ảnh, hoặc dán rỗng.
 */
export function imageFromTransfer(data: DataTransfer | null): File | null {
  if (!data) return null;

  for (const item of data.items) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) return file;
  }

  // Safari đôi khi chỉ điền `files` mà không điền `items`.
  return Array.from(data.files).find((f) => f.type.startsWith("image/")) ?? null;
}
