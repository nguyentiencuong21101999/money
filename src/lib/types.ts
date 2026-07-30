export type TxType = "income" | "expense";

export interface Transaction {
  id: string;
  /** income = tiền vào (cộng), expense = tiền ra (trừ) */
  type: TxType;
  /** VND, luôn là số dương — dấu do `type` quyết định */
  amount: number;
  /** ghi chú người dùng tự nhập */
  note: string;
  category: string;
  /** ngày giao dịch, dạng YYYY-MM-DD */
  date: string;
  /** YYYY-MM — nhân bản từ `date` để query 1 tháng không cần composite index */
  month: string;
  source: "manual" | "ocr";
  /** tên cửa hàng / nơi thanh toán, do AI đọc từ ảnh */
  merchant?: string;
  /** ảnh bill đã nén, dạng data URL base64 */
  thumbnail?: string;
  createdAt?: number;
}

/** Kết quả AI đọc từ ảnh bill — cũng là responseSchema gửi cho Gemini. */
export interface ScanResult {
  amount: number;
  currency: string;
  date: string | null;
  merchant: string | null;
  category: string;
  type: TxType;
  /** 0..1 — dưới 0.6 thì UI cảnh báo người dùng kiểm lại */
  confidence: number;
  note: string;
}
