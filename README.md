# Sổ tiền

Web thống kê thu chi cá nhân. Chụp ảnh hoá đơn → AI đọc ra số tiền, bạn thêm ghi chú và lưu; hoặc nhập tay. Xem thống kê theo từng tháng.

## Chạy lần đầu

```bash
npm install
cp .env.local.example .env.local   # rồi điền 7 giá trị, xem CHECKLIST.md mục B
npm run dev
```

Mở http://localhost:3000.

Toàn bộ các bước lấy key (Gemini + Firebase) nằm trong [CHECKLIST.md](CHECKLIST.md).

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy dev server |
| `npm run build` | Build bản production |
| `npm test` | Chạy test cho phần đọc số tiền |
| `npm run check-models` | Xem key Gemini của bạn gọi được những model nào |
| `npm run lint` | ESLint |

## Cách hoạt động

```
Trình duyệt ──► Firebase Auth (đăng nhập Google)
           └──► Cloud Firestore (đọc/ghi trực tiếp, chặn bằng firestore.rules theo uid)

Ảnh bill ──► nén trong trình duyệt ──► POST /api/scan ──► Gemini ──► JSON điền sẵn vào form
```

- **Không dùng Firebase Storage.** Từ 03/02/2026 Cloud Storage bắt buộc gói Blaze (phải gắn thẻ). Thay vào đó ảnh được nén còn cạnh dài 640px rồi lưu base64 ngay trong document Firestore. Firestore + Authentication vẫn miễn phí ở gói Spark.
- **`GEMINI_API_KEY` chỉ nằm ở server.** Trình duyệt gọi `/api/scan`, không bao giờ thấy key.
- **Chuỗi model dự phòng.** `/api/scan` thử lần lượt `gemini-3.5-flash` → `gemini-3.6-flash` → `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite`. Mỗi model có quota free riêng nên hết lượt con này vẫn còn con kia. Model 404/429/503 bị bỏ qua và chạy tiếp con sau. Đổi thứ tự bằng biến `GEMINI_MODELS`.
  Lưu ý: `gemini-2.5-flash` và `gemini-2.5-flash-lite` **vẫn nằm trong danh sách models nhưng gọi vào là 404** (`no longer available to new users`) — đó là lý do `npm run check-models` gọi thật vào từng model chứ không chỉ đọc danh sách.
- **AI không bao giờ tự ghi dữ liệu.** Kết quả quét luôn hiện trong form để bạn xác nhận. Nếu AI không chắc chắn, ô số tiền sẽ được tô vàng.
- **Một listener Firestore cho cả 6 tháng.** Chỉ lọc theo field `month` nên không cần tạo composite index.

## Cấu trúc

| Đường dẫn | Việc |
|---|---|
| `src/app/api/scan/route.ts` | Gọi Gemini đọc ảnh, tự tụt xuống model dự phòng khi hết quota |
| `scripts/check-models.mjs` | Kiểm tra key gọi được model nào, gợi ý giá trị `GEMINI_MODELS` |
| `src/components/Dashboard.tsx` | Trang chính, ráp mọi thứ lại |
| `src/components/TxSheet.tsx` | Form thêm/sửa giao dịch (dùng chung cho nhập tay và sau khi quét) |
| `src/lib/money.ts` | Đọc/định dạng tiền VND — hiểu cả `50k`, `1tr5`, `1.234.567` |
| `src/lib/transactions.ts` | CRUD + hook realtime Firestore |
| `src/lib/stats.ts` | Tính tổng tháng, gộp theo danh mục, xu hướng 6 tháng |
| `firestore.rules` | Phân quyền — phải dán vào Firebase Console |

## Bảng màu

Tông hồng, mọi giá trị đều đo bằng công cụ chứ không chọn bằng mắt. Định nghĩa trong [`src/app/globals.css`](src/app/globals.css).

| Vai trò | Mã | Ghi chú |
|---|---|---|
| Nền trang | `#faf5f7` | ánh hồng rất nhạt |
| Nền thẻ / nền biểu đồ | `#fffafb` | |
| Chữ chính | `#1a1015` | đen ngả mận, tương phản 18:1 |
| Tiền ra + màu nhận diện | `#d6336c` | |
| Tiền vào | `#2a78d6` | |
| Nút chính | `#c2255c` | chữ trắng đạt 5.66:1 |

Cặp màu biểu đồ đạt sạch 5/5 tiêu chí của validator: CVD ΔE 17.2 (protan), normal ΔE 29.8, contrast cả hai ≥ 3:1.

**Đã loại hồng + xanh ngọc** (`#d6336c` ↔ `#0f9b8e`): nhìn thường rất hợp nhưng với người mù màu lục chỉ còn ΔE 5.5, dưới ngưỡng an toàn 8 — hai màu gần như trùng nhau. Đây là lý do phải chạy validator thay vì tin vào cảm giác.

## Deploy lên Vercel (free)

1. Đẩy code lên GitHub. `.env.local` đã được `.gitignore` bỏ qua nên key không bị lộ.
2. vercel.com → **Import repo** → mục **Environment Variables** dán đủ **7 biến bắt buộc** (`GEMINI_API_KEY` + 6 biến `NEXT_PUBLIC_FIREBASE_*`) và **`ALLOWED_EMAILS`** = email Google của bạn.
3. Firebase Console → **Authentication → Settings → Authorized domains** → **Add domain** → dán domain `*.vercel.app` vừa được cấp. Không làm bước này thì đăng nhập Google báo `auth/unauthorized-domain`.

Những chỗ đã xử lý sẵn cho môi trường public:

| Vấn đề | Cách xử lý |
|---|---|
| `/api/scan` là endpoint công khai, ai cũng gọi được và đốt quota Gemini | Bắt buộc gửi kèm Firebase ID token; xác thực qua REST endpoint của Google (không cần service account). Thêm `ALLOWED_EMAILS` để chỉ mình bạn quét được |
| Vercel chặn cứng request body ở **4,5MB**, trả 413 trước khi code chạy | Giới hạn base64 ở 3MB; ảnh nén sẵn ở client chỉ ~200–500KB |
| Function chạy mặc định ở `iad1` (Mỹ), chậm khi gọi từ VN | [`vercel.json`](vercel.json) ghim region `sin1` (Singapore) |
| Hobby giới hạn thời gian chạy function | Tối đa 300s trên Hobby; route đặt `maxDuration = 60`, dư sức |

`NEXT_PUBLIC_FIREBASE_*` bị nhúng thẳng vào bundle và ai xem source cũng thấy — **đây là bình thường**, Firebase thiết kế web config để công khai. Cái chặn truy cập là [`firestore.rules`](firestore.rules), không phải việc giấu config. `GEMINI_API_KEY` thì ngược lại, không có tiền tố `NEXT_PUBLIC_` nên chỉ tồn tại phía server.
