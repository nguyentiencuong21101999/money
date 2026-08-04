export interface PreparedImage {
  /** Bản gửi cho AI: cạnh dài 1280px, đủ nét để đọc chữ trên bill. */
  forAI: { mimeType: string; base64: string };
  /** Bản lưu kèm giao dịch: cạnh dài 900px, nén để lọt giới hạn 1MB/document. */
  thumbnail: string;
}

const AI_MAX_EDGE = 1280;
/**
 * 900px chứ không phải 640px như trước: đây là bản DUY NHẤT còn lại của tờ bill
 * (bản 1280px chỉ gửi cho AI rồi bỏ), mà 640px phóng to lên thì chữ số tiền
 * nhoè tới mức không đọc lại được để đối chiếu.
 */
const THUMB_MAX_EDGE = 900;
/** Firestore chặn document > 1MB; rules còn chặn thumbnail > 400KB. */
const THUMB_MAX_BYTES = 360_000;

export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await decode(file);
  try {
    const forAIUrl = draw(bitmap, AI_MAX_EDGE, 0.85);
    let thumbnail = draw(bitmap, THUMB_MAX_EDGE, 0.72);

    // Bill chụp dọc, nhiều chi tiết vẫn có thể vượt ngưỡng — hạ dần chất lượng.
    for (const quality of [0.55, 0.45]) {
      if (thumbnail.length <= THUMB_MAX_BYTES) break;
      thumbnail = draw(bitmap, THUMB_MAX_EDGE, quality);
    }
    // Hết đường mới chịu hạ kích thước, và hạ theo từng bậc. Giữ nhiều điểm ảnh
    // mà nén mạnh vẫn còn đọc được chữ; thu nhỏ hẳn thì chữ mất luôn nét, không
    // cách nào lấy lại.
    if (thumbnail.length > THUMB_MAX_BYTES) thumbnail = draw(bitmap, 640, 0.5);
    if (thumbnail.length > THUMB_MAX_BYTES) thumbnail = draw(bitmap, 400, 0.4);

    return { forAI: splitDataUrl(forAIUrl), thumbnail };
  } finally {
    bitmap.close?.();
  }
}

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error(
      "Không đọc được ảnh này. Thử ảnh JPG/PNG (ảnh HEIC của iPhone có thể không mở được trên Chrome).",
    );
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

function splitDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const [head, base64] = dataUrl.split(",");
  const mimeType = head.slice(head.indexOf(":") + 1, head.indexOf(";")) || "image/webp";
  return { mimeType, base64 };
}
