# Checklist — Web thống kê chi tiêu

## A. Phần Claude làm (code)

- [x] **A1.** Khởi tạo Next.js 16 + TypeScript + Tailwind v4, cài `firebase` + `@google/genai`
- [x] **A2.** `lib/firebase.ts` + `firestore.rules` + `AuthGate` — đăng nhập Google
- [x] **A3.** `lib/money.ts`, `lib/categories.ts`, `lib/transactions.ts` — CRUD Firestore realtime
- [x] **A4.** `TxSheet` + `TxList` — nhập tay số tiền + ghi chú, xem/sửa/xoá
- [x] **A5.** `lib/image.ts` + `/api/scan` + `UploadScan` — upload ảnh bill → Gemini đọc số tiền
- [x] **A6.** `SummaryPanel` + `BudgetBar` + `CategoryBars` + `MonthlyTrend` — thống kê theo tháng
- [x] **A7.** `lib/csv.ts` + nút xuất Excel/CSV
- [x] **A8.** Responsive điện thoại, trạng thái rỗng/đang tải, `npm run build` + `npm test` sạch lỗi

## B. Phần bạn cần tự làm (lấy key, ~5 phút)

> Chưa làm mấy bước này thì app vẫn chạy được nhưng chưa đăng nhập / chưa quét ảnh được.

- [x] **B1.** Lấy **Gemini API key** free
  1. Vào https://aistudio.google.com/apikey
  2. Đăng nhập Google → bấm **Create API key** → chọn/tạo project → **Copy**
- [x] **B2.** Tạo **Firebase project** (giữ gói Spark miễn phí, KHÔNG cần thẻ)
  1. Vào https://console.firebase.google.com → **Create a project**
  2. Đặt tên bất kỳ (vd `money-tracker`) → tắt Google Analytics cho nhanh → Create
- [x] **B3.** Bật **Authentication**
  1. Menu trái → **Build → Authentication** → **Get started**
  2. Tab **Sign-in method** → chọn **Google** → bật **Enable** → chọn email hỗ trợ → **Save**
- [x] **B4.** Tạo **Firestore Database**
  1. Menu trái → **Build → Firestore Database** → **Create database**
  2. Chọn location `asia-southeast1` (Singapore) → chọn **Production mode** → Create
- [x] **B5.** Lấy **config web**
  1. Bấm ⚙️ **Project settings** → kéo xuống mục **Your apps** → bấm icon `</>` (Web)
  2. Đặt nickname bất kỳ → **Register app**
  3. Copy đoạn `firebaseConfig = { apiKey: "...", authDomain: "...", ... }`
- [x] **B6.** Dán key vào file `.env.local`
  1. Copy file `.env.local.example` thành `.env.local`
  2. Điền 1 giá trị từ B1 + 6 giá trị từ B5
- [x] **B6b.** Chạy `npm run check-models` → xác nhận chuỗi model dự phòng đều gọi được
      *(nếu có model báo ✗ thì script sẽ in sẵn dòng `GEMINI_MODELS=…` để bạn dán vào `.env.local`)*
- [x] **B7.** Dán **security rules**
  1. Firebase Console → **Firestore Database** → tab **Rules**
  2. Xoá hết, dán toàn bộ nội dung file `firestore.rules` trong dự án → **Publish**
      *(mỗi lần sửa file `firestore.rules` trong dự án là phải dán lại và Publish lần nữa)*
- [ ] **B8.** (Không bắt buộc) Bật **thông báo đẩy**
  1. ⚙️ **Project settings** → tab **Cloud Messaging** → mục **Web Push certificates**
     → **Generate key pair** → copy chuỗi vừa hiện ra
  2. Dán vào `.env.local`: `NEXT_PUBLIC_FIREBASE_VAPID_KEY=...` (và thêm cả trên Vercel nếu đã deploy)
  3. Chạy lại `npm run dev` → menu người dùng hiện thêm nút **Bật thông báo**
      *(bỏ qua bước này thì app giấu luôn phần thông báo, mọi thứ khác chạy bình thường)*

## C. Chạy thử

- [x] **C1.** `npm run dev` → mở http://localhost:3000
- [ ] **C2.** Đăng nhập bằng Google → vào được dashboard
- [ ] **C3.** Nhập tay 1 khoản chi + 1 khoản thu → số liệu tháng đúng
      *(ô số tiền gõ được `50k`, `1tr5`, `250.000` — đều hiểu)*
- [ ] **C4.** Upload 1 ảnh bill thật → tự điền số tiền, thêm ghi chú → lưu được
- [ ] **C5.** Thử 1 ảnh không phải bill → báo lỗi nhẹ nhàng, form vẫn nhập tay được
- [ ] **C6.** Đặt hạn mức tháng → thanh cảnh báo đổi màu khi vượt
- [ ] **C7.** Đổi sang tháng khác rồi quay lại → dữ liệu tách bạch, không mất
- [ ] **C8.** Bấm xuất CSV → mở bằng Excel, tiếng Việt không lỗi font

## D. Đưa lên mạng để dùng bằng điện thoại (làm sau cũng được)

- [ ] **D1.** Đẩy code lên GitHub *(`.env.local` đã được gitignore, key không bị lộ)*
- [ ] **D2.** vercel.com → **Add New → Project** → Import repo
- [ ] **D3.** Ở mục **Environment Variables**, dán **8 biến**:
      7 biến trong `.env.local` + thêm **`ALLOWED_EMAILS`** = email Google của bạn
      *(thiếu `ALLOWED_EMAILS` thì bất kỳ ai vào được web cũng đốt được quota Gemini của bạn)*
- [ ] **D4.** Bấm **Deploy**, đợi ~2 phút, Vercel cấp cho bạn domain dạng `ten-app.vercel.app`
- [ ] **D5.** Firebase Console → **Authentication → Settings → Authorized domains** → **Add domain**
      → dán domain Vercel vừa nhận
      *(bỏ qua bước này thì đăng nhập báo lỗi `auth/unauthorized-domain`)*
- [ ] **D6.** Mở domain đó bằng điện thoại → đăng nhập → thử chụp 1 hoá đơn
- [ ] **D7.** (tuỳ chọn) Trên iPhone/Android bấm **Chia sẻ → Thêm vào MH chính** để dùng như app
