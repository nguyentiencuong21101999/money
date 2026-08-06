/**
 * Tạo ảnh xem trước 200px cho thư viện ảnh. Chỉ chạy trong trình duyệt.
 *
 * Cố ý KHÔNG dùng lib/image.ts của sổ tiền: bên đó nén ảnh để nhét vừa 400KB
 * trong document Firestore và đó là bản DUY NHẤT còn lại của tờ bill, nên phải
 * giữ 900px. Ở đây bản gốc đã nằm nguyên vẹn trên Drive, thumb chỉ có một việc:
 * hiện lưới ảnh cho thật nhanh.
 *
 * VÌ SAO THUMB NẰM TRONG FIRESTORE CHỨ KHÔNG PHẢI DRIVE
 * 200px WebP chỉ quanh 8–14KB. Nhét vào document nghĩa là lưới ảnh vẽ ra ngay
 * từ đúng một query Firestore đã có sẵn cache trên đĩa — không thêm một lượt
 * gọi mạng nào. Nếu để thumb trên Drive thì mở thư viện 30 ảnh là 30 request
 * qua server, mỗi cái một vòng xác thực; chậm hơn hẳn mà chẳng đổi lấy gì.
 */

/** Đủ nét cho ô lưới ~100px trên màn hình Retina (gấp đôi mật độ điểm ảnh). */
const THUMB_MAX_EDGE = 200;

/**
 * Trần cho thumb. Rules chặn ở 60KB; để 40KB là còn dư chỗ cho phần metadata
 * khác trong cùng document.
 */
const THUMB_MAX_BYTES = 40_000;

export interface Thumbnail {
  /** data URL WebP. */
  dataUrl: string;
  /** Kích thước ảnh GỐC, không phải kích thước thumb. */
  width: number;
  height: number;
}

/**
 * null khi trình duyệt không giải mã được ảnh — hay gặp nhất là HEIC của iPhone
 * trên Chrome. Trả null chứ không ném lỗi: bản gốc vẫn upload lên Drive được
 * bình thường, chỉ là lưới ảnh phải hiện ô giữ chỗ. Chặn cả lượt upload chỉ vì
 * không vẽ được ảnh xem trước thì quá đáng.
 */
export async function makeThumbnail(file: File): Promise<Thumbnail | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  try {
    let dataUrl = draw(bitmap, THUMB_MAX_EDGE, 0.72);

    /*
      Hạ dần CẢ chất lượng LẪN kích thước, không chỉ chất lượng.

      Lý do phải hạ kích thước: toDataURL("image/webp") trên trình duyệt không
      encode được WebP sẽ âm thầm trả về PNG — và PNG BỎ QUA hoàn toàn tham số
      quality. Lúc đó hạ chất lượng là vô nghĩa, vòng lặp chạy mấy lần cũng ra
      đúng một chuỗi, mà PNG 200×200 thì dễ vượt 60KB.
    */
    for (const [edge, quality] of [
      [THUMB_MAX_EDGE, 0.6],
      [THUMB_MAX_EDGE, 0.45],
      [160, 0.5],
      [120, 0.5],
      [96, 0.45],
    ] as const) {
      if (dataUrl.length <= THUMB_MAX_BYTES) break;
      dataUrl = draw(bitmap, edge, quality);
    }

    /*
      Vẫn quá ngưỡng thì trả null, KHÔNG trả chuỗi quá cỡ.

      Đây là chỗ đã gây ra một lỗi thật: Firestore rules chặn thumb/logo ở 60000
      ký tự, nên một chuỗi quá cỡ làm cả lần ghi bị từ chối với thông báo
      "Missing or insufficient permissions" — chẳng nói gì về kích thước. Với
      album thì hậu quả là tạo album xong không vào được album đó, vì promise
      addDoc reject nên bước điều hướng không bao giờ chạy.

      Không có thumb thì lưới hiện ô giữ chỗ, bìa album hiện chữ viết tắt — mất
      một chút thẩm mỹ, còn ghi được dữ liệu.
    */
    if (dataUrl.length > THUMB_MAX_BYTES) {
      console.warn(
        `[photo-thumb] không nén nổi xuống ${THUMB_MAX_BYTES} ký tự (còn ${dataUrl.length}), bỏ thumb`,
      );
      return null;
    }

    return { dataUrl, width: bitmap.width, height: bitmap.height };
  } catch {
    return null;
  } finally {
    bitmap.close?.();
  }
}

function draw(bitmap: ImageBitmap, maxEdge: number, quality: number): string {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không hỗ trợ xử lý ảnh.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/webp", quality);
}
