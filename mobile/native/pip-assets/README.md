# pip-assets

Chỗ để file media muốn hiện trong ô PiP "keep-alive" (xem `../PipContent.swift`).

Mọi file ở đây được `plugins/withKeepAlivePip.js` copy vào app bundle iOS lúc
prebuild, đọc lại bằng `Bundle.main.url(forResource: "tên", withExtension: "đuôi")`.

## Để ẢNH custom vào ô PiP (mặc định hiện tại)

1. Copy ảnh vào đây, đặt tên `pip.png` (chấp nhận cả `.jpg` / `.jpeg` / `.heic`).
   - Nên ảnh **dọc ~9:16**; ảnh được **aspect-fill** nên phần dư bị cắt hai bên.
   - Nên dùng **PNG**: ảnh chụp từ iPhone (JPEG/HEIC) hay có EXIF orientation, mà
     code không đọc EXIF nên ảnh có thể bị nằm ngang.
2. `npx expo prebuild -p ios` rồi build lại.

Không có file nào tên `pip.*` thì tự vẽ logo trái tim (không cần asset).

## Để VIDEO vào ô PiP

1. Copy video vào đây, ví dụ `pip.mp4`.
   - **Tỉ lệ khung hình của video quyết định hình dạng ô PiP**: ngang (1280x720)
     → ô PiP ngang, dọc (720x1280) → ô PiP dọc hẹp. Clip test hiện tại là ngang.
   - Ngắn (vài giây), nhẹ (≤ vài MB), H.264 hoặc HEVC — nó lặp vô hạn dưới nền.
   - Audio bị bỏ qua (chỉ track hình được đọc).
2. Mở `../PipContent.swift`, trong `makePipContent(cameraTrack:)` đổi sang
   `return PipVideoContent(name: "pip", ext: "mp4")`.
3. `npx expo prebuild -p ios` rồi build lại.

Thiếu file hay decode lỗi thì app tự quay về logo trái tim, PiP vẫn chạy.
