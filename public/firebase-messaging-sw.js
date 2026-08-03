/*
  Service worker nhận thông báo đẩy khi app KHÔNG mở.

  Cố tình KHÔNG nạp SDK Firebase qua importScripts: làm vậy phải chép nguyên
  cụm config Firebase vào đây (service worker không đọc được process.env), tức
  là cùng một config nằm hai nơi, sửa một chỗ quên chỗ kia. Payload của FCM gửi
  xuống trình duyệt là JSON thuần, tự đọc lấy còn ngắn hơn.

  File phải nằm ở gốc domain thì scope mới phủ toàn site — đừng chuyển đi đâu.
*/

// Bản mới cài xong dùng luôn, không nằm chờ tab cũ đóng hết.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { body: event.data.text() } };
  }

  // FCM để nội dung ở `notification` khi gửi kèm tiêu đề/nội dung sẵn, ở `data`
  // khi gửi dữ liệu thuần. Nhận cả hai cho khỏi phụ thuộc cách bên gửi soạn.
  const content = payload.notification ?? payload.data ?? {};
  const link = payload.fcmOptions?.link ?? content.link ?? "/";

  event.waitUntil(
    self.registration.showNotification(content.title ?? "Sổ tiền", {
      body: content.body ?? "",
      icon: "/apple-icon.png",
      badge: "/apple-icon.png",
      // Cùng tag thì thông báo mới đè lên cái cũ, không xếp chồng một chồng dài.
      tag: content.tag ?? "so-tien",
      data: { link },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.link ?? "/", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Đang mở sẵn thì đưa tab đó lên, đừng mở thêm tab thứ hai.
      const existing = windows.find((c) => c.url === target) ?? windows[0];
      if (existing) {
        await existing.focus();
        if (existing.url !== target && existing.navigate) await existing.navigate(target);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
