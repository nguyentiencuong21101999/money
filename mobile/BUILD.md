# Build & cài app Secret (mobile)

## Máy & UDID

| Máy | UDID phần cứng (cho `expo run:ios --device`) | UUID devicectl (cho `devicectl install`) |
|-----|----------------------------------------------|------------------------------------------|
| Ku Lép (iPhone 16 Pro Max) | `00008140-000E14E20152801C` | `37B00A10-E5F3-5B43-AD56-CA4471779FDF` |
| Thu (iPhone 15 Pro Max)    | `00008130-000265582606001C` | `AEDB1245-E183-5AA3-9BEA-3EBEE6247532` |

Lấy UDID: `xcrun devicectl list devices` (cột Identifier = UUID devicectl) hoặc
`xcrun xctrace list devices` (UDID phần cứng).

---

## Cách 1 — Chỉ CÀI bản `.app` đã build sẵn (nhanh)

Bản Release build ra nằm ở `/tmp/secret-release/Build/Products/Release-iphoneos/Secret.app`
(đổi đường dẫn nếu build chỗ khác).

Ku Lép:
```
xcrun devicectl device install app --device 37B00A10-E5F3-5B43-AD56-CA4471779FDF /tmp/secret-release/Build/Products/Release-iphoneos/Secret.app
```

Thu:
```
xcrun devicectl device install app --device AEDB1245-E183-5AA3-9BEA-3EBEE6247532 /tmp/secret-release/Build/Products/Release-iphoneos/Secret.app
```

---

## Cách 2 — Build lại từ đầu + cài

```
cd /Users/tieucuong/Documents/AI/Money/mobile
```

Ku Lép:
```
npx expo run:ios --device 00008140-000E14E20152801C --configuration Release --no-install
```

Thu:
```
npx expo run:ios --device 00008130-000265582606001C --configuration Release --no-install
```

- `--device` nhận cả TÊN (vd `--device "Ku Lép"`) lẫn UDID. Máy Thu tên có emoji
  (`Thu🙈`) nên dùng UDID cho chắc.
- `--no-install` = bỏ qua `pod install` (khỏi ghi đè pod). Bỏ ra cũng được, chỉ chậm hơn.
- `--configuration Release` = bản độc lập, JS nhúng sẵn, KHÔNG cần Metro/Mac. Bỏ
  cờ này = bản Debug (cần Metro chạy `npx expo start`).

### Build "generic" rồi cài sau (không cần máy lúc build)
```
xcodebuild -workspace ios/Secret.xcworkspace -scheme Secret -configuration Release \
  -destination 'generic/platform=iOS' -allowProvisioningUpdates \
  -derivedDataPath /tmp/secret-release build
```
Rồi cài bằng Cách 1.

---

## Điều kiện để cài được

Máy phải hiện `available`/`connected` trong `xcrun devicectl list devices` (KHÔNG phải `unavailable`):

- **Cắm cáp USB** (chắc nhất, bất kể mạng), hoặc
- **Cùng Wi-Fi với Mac + mở khoá màn hình** (máy ngủ/khoá là rớt về `unavailable`).

⚠️ **VPN (Tailscale…) trên Mac chắn mDNS → máy `unavailable` dù cùng Wi-Fi.**
Tắt Tailscale (menu bar → Disconnect) khi cài qua Wi-Fi. Kẹt kết nối:
`sudo pkill -9 -f CoreDeviceService` rồi cắm lại.

---

## Khi SỬA CODE

- **Sửa JS** (src/…): bản Debug hot-reload qua Metro. Bản Release phải build lại.
- **Sửa native** (`native/*.swift`, `*.m`): copy sang `ios/Secret/` rồi build, hoặc
  `npx expo prebuild -p ios` (plugin tự copy). KHÔNG copy = build ra code cũ dù báo
  "Build Succeeded". Kiểm chứng:
  `strings <Secret.app>/Secret* | grep <TênHàmMới>`.

## Lưu ý tài khoản Apple free
App ký bằng Personal Team → **hết hạn sau 7 ngày**, tới hạn cắm build lại. Máy mới
lần đầu phải `-allowProvisioningUpdates` để đăng ký thiết bị, và bật Developer Mode
+ "Tin cậy" developer trong Cài đặt.
