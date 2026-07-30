import { normalizeCategory } from "./categories";
import { isValidISODate } from "./date";
import { prepareImage } from "./image";
import type { ScanResult, TxType } from "./types";

export interface ScannedReceipt {
  result: ScanResult;
  /** Ảnh đã nén để lưu kèm giao dịch. */
  thumbnail: string;
}

/**
 * Nén ảnh rồi gửi cho /api/scan. Ném Error kèm thông báo tiếng Việt khi thất bại.
 * Tách khỏi component để cả nút upload lẫn thao tác dán ở dashboard dùng chung.
 */
export async function scanReceipt(
  file: File,
  idToken: string | undefined,
): Promise<ScannedReceipt> {
  const { forAI, thumbnail } = await prepareImage(file);

  const response = await fetch("/api/scan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Chứng minh request đến từ người đã đăng nhập, để endpoint công khai
      // trên mạng không bị người lạ đốt quota Gemini.
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify(forAI),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? "Không quét được ảnh.");

  return { result: payload as ScanResult, thumbnail };
}

/** Giá trị các ô trong form, suy ra từ kết quả AI. */
export interface ScanDraft {
  type: TxType;
  /** "" khi AI không đọc được số tiền. */
  amountText: string;
  category: string;
  date: string | null;
  merchant: string;
  note: string;
  thumbnail: string;
  /** true khi AI không chắc chắn — form tô vàng ô số tiền để nhắc kiểm lại. */
  lowConfidence: boolean;
}

export function draftFromScan({ result, thumbnail }: ScannedReceipt): ScanDraft {
  const type: TxType = result.type === "income" ? "income" : "expense";
  return {
    type,
    amountText: result.amount > 0 ? String(Math.round(result.amount)) : "",
    category: normalizeCategory(result.category, type),
    date: isValidISODate(result.date) ? result.date : null,
    merchant: result.merchant ?? "",
    note: result.note ?? "",
    thumbnail,
    lowConfidence: result.confidence < 0.6 || result.amount <= 0,
  };
}

export function describeScanError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
