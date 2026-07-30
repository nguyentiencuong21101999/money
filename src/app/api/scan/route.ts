import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/categories";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Chuỗi model dự phòng, xếp từ đọc tốt nhất xuống nhẹ nhất.
 * Mỗi model có QUOTA FREE RIÊNG, nên hết lượt con này vẫn còn con kia —
 * chuỗi càng dài thì số lượt quét miễn phí mỗi ngày càng nhiều.
 * Model không tồn tại sẽ trả 404 và tự động bị bỏ qua (xem isRetryable).
 * Đổi thứ tự hoặc rút gọn bằng biến GEMINI_MODELS trong .env.local.
 */
const DEFAULT_MODELS = [
  "gemini-3.5-flash", // ~3,5s — mạnh, ổn định
  "gemini-3.6-flash", // mới nhất, dự phòng khi con trên hết quota
  "gemini-3.5-flash-lite", // ~1,2s — quota rộng hơn
  "gemini-3.1-flash-lite", // ~1,5s — lớp cuối
];

const MODELS =
  process.env.GEMINI_MODELS?.split(",")
    .map((m) => m.trim())
    .filter(Boolean) ?? DEFAULT_MODELS;

const PROMPT = `Bạn đọc ảnh chứng từ thanh toán của người Việt Nam: hoá đơn siêu thị/nhà hàng, biên lai POS, ảnh chụp màn hình chuyển khoản (MoMo, ZaloPay, VietQR, app ngân hàng), hoặc tin nhắn biến động số dư.

Nhiệm vụ: trích ra SỐ TIỀN CUỐI CÙNG THỰC SỰ GIAO DỊCH.

Quy tắc:
- Lấy dòng tổng cuối cùng: "Tổng cộng", "Thành tiền", "Tổng thanh toán", "Số tiền", "Amount". BỎ QUA tạm tính, tiền khách đưa, tiền thối lại, chiết khấu, thuế VAT của từng dòng.
- amount là số nguyên VND, không dấu chấm/phẩy, không ký hiệu. "35.000đ" → 35000. Nếu ảnh ghi bằng USD hay ngoại tệ khác thì giữ nguyên con số và ghi đúng currency, KHÔNG tự quy đổi.
- type = "expense" khi là tiền chi ra (mua hàng, chuyển đi, thanh toán). type = "income" chỉ khi rõ ràng là tiền nhận vào (báo có, nhận chuyển khoản, lương).
- date theo đúng ngày in trên chứng từ, định dạng YYYY-MM-DD. Chứng từ Việt Nam viết ngày/tháng/năm. Không thấy ngày thì trả null.
- merchant là tên cửa hàng / người nhận tiền. Không thấy thì null.
- category phải chọn ĐÚNG một giá trị trong danh sách:
  - Nếu type="expense": ${EXPENSE_CATEGORIES.join(" | ")}
  - Nếu type="income": ${INCOME_CATEGORIES.join(" | ")}
- note: một câu ngắn tiếng Việt mô tả khoản này (tối đa 60 ký tự), ví dụ "Ăn trưa tại Cơm tấm Ba Ghiền".
- confidence: 0..1, mức tự tin vào amount. Nếu ảnh mờ, bị che, hoặc KHÔNG PHẢI chứng từ thanh toán thì trả amount=0 và confidence=0.

Chỉ trả JSON đúng schema, không giải thích thêm.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    amount: { type: Type.NUMBER },
    currency: { type: Type.STRING },
    date: { type: Type.STRING, nullable: true },
    merchant: { type: Type.STRING, nullable: true },
    category: { type: Type.STRING },
    type: { type: Type.STRING, enum: ["income", "expense"] },
    confidence: { type: Type.NUMBER },
    note: { type: Type.STRING },
  },
  required: ["amount", "currency", "category", "type", "confidence", "note"],
  propertyOrdering: [
    "amount",
    "currency",
    "date",
    "merchant",
    "category",
    "type",
    "confidence",
    "note",
  ],
};

interface ScanRequest {
  mimeType?: string;
  base64?: string;
}

/**
 * Vercel chặn cứng body request ở 4,5MB và trả 413 trước cả khi code chạy.
 * Để 3MB cho phần base64 là còn dư chỗ cho JSON bọc ngoài và header.
 * Ảnh sau khi nén ở client (1280px, WebP) thường chỉ ~200–500KB nên không chạm ngưỡng.
 */
const MAX_BASE64_LENGTH = 3_000_000;

/** Chỉ cho phép các email này quét. Bỏ trống = ai đăng nhập Google cũng quét được. */
const ALLOWED_EMAILS =
  process.env.ALLOWED_EMAILS?.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean) ?? [];

/**
 * Kiểm tra ID token của Firebase bằng REST endpoint của Google.
 * Dùng cách này thay cho firebase-admin để khỏi phải thêm service account key
 * (3 biến môi trường nữa) và khỏi kéo thêm ~10MB vào bundle.
 * Trả về Response lỗi nếu từ chối, null nếu hợp lệ.
 */
async function rejectUnauthorized(request: Request): Promise<Response | null> {
  const webApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!webApiKey) {
    return fail(503, "Thiếu NEXT_PUBLIC_FIREBASE_API_KEY nên không xác thực được.");
  }

  const idToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!idToken) return fail(401, "Cần đăng nhập mới đọc được ảnh hoá đơn.");

  let email: string | undefined;
  try {
    const lookup = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${webApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      },
    );
    if (!lookup.ok) {
      return fail(401, "Phiên đăng nhập đã hết hạn. Tải lại trang rồi thử lại.");
    }
    email = (await lookup.json())?.users?.[0]?.email?.toLowerCase();
  } catch {
    return fail(503, "Không kiểm tra được phiên đăng nhập. Kiểm tra kết nối mạng.");
  }

  if (ALLOWED_EMAILS.length > 0 && (!email || !ALLOWED_EMAILS.includes(email))) {
    return fail(403, "Tài khoản này chưa được phép đọc ảnh hoá đơn. Bạn gõ tay nhé.");
  }

  return null;
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return fail(
      503,
      "Chưa có GEMINI_API_KEY trong .env.local. Xem bước B1 trong CHECKLIST.md. Bạn vẫn có thể nhập tay.",
    );
  }

  // Khi deploy lên mạng, endpoint này ai cũng gọi được nếu không chặn —
  // và mỗi lượt gọi đốt quota Gemini của bạn. Bắt buộc phải đăng nhập.
  const denied = await rejectUnauthorized(request);
  if (denied) return denied;

  let body: ScanRequest;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Dữ liệu gửi lên không hợp lệ.");
  }

  const { mimeType, base64 } = body;
  if (!base64 || !mimeType) return fail(400, "Thiếu ảnh.");
  if (base64.length > MAX_BASE64_LENGTH) {
    return fail(413, "Ảnh quá lớn, thử chụp lại nhỏ hơn.");
  }

  const ai = new GoogleGenAI({ apiKey });
  let lastError: unknown = null;

  for (const model of MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [{ inlineData: { mimeType, data: base64 } }, { text: PROMPT }],
          },
        ],
        config: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      });

      const text = response.text;
      if (!text) throw new Error("empty-response");
      return NextResponse.json({ ...JSON.parse(text), model });
    } catch (error) {
      lastError = error;
      if (!isRetryable(error)) break;
      // In ra terminal để biết model nào tụt và vì sao — hữu ích khi chỉnh GEMINI_MODELS.
      console.warn(`[scan] ${model} không dùng được, thử model tiếp theo:`, error);
    }
  }

  return fail(502, describe(lastError));
}

function isRetryable(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  const message = String((error as { message?: string })?.message ?? error);
  return (
    status === 429 ||
    status === 404 ||
    status === 503 ||
    /quota|rate limit|not found|overloaded|unavailable/i.test(message)
  );
}

function describe(error: unknown): string {
  const message = String((error as { message?: string })?.message ?? error);
  if (/api[_ ]?key|API_KEY_INVALID|unauthor|permission/i.test(message)) {
    return "GEMINI_API_KEY không hợp lệ. Lấy lại key ở aistudio.google.com/apikey.";
  }
  if (/quota|rate limit|429/i.test(message)) {
    return "Hôm nay hết lượt đọc ảnh miễn phí rồi, mai lại dùng được. Giờ gõ tay nhé.";
  }
  return "Ảnh này đọc không ra. Bạn gõ tay giúp nhé.";
}

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}
