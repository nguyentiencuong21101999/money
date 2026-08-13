const { withAppDelegate, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Bật camera chạy nền trên iOS 18 — đây là LÝ DO TỒN TẠI của cả app native này.
 *
 * Mặc định iOS ngắt camera ngay khi app xuống nền (`AVCaptureSession` báo
 * `videoDeviceNotAvailableInBackground`). Từ iOS 18, app khai `voip` trong
 * UIBackgroundModes được phép giữ camera, nhưng phải TỰ bật cờ trên capture
 * session — hệ thống không tự làm. react-native-webrtc phơi cờ đó ra qua
 * `WebRTCModuleOptions.sharedInstance().enableMultitaskingCameraAccess`.
 *
 * Phải là config plugin chứ không sửa tay ios/AppDelegate.swift: thư mục ios/
 * do `expo prebuild` sinh ra và nằm trong .gitignore, sửa tay là mất sau lần
 * prebuild kế tiếp — mà mất thì app vẫn chạy, chỉ âm thầm không giữ được camera
 * nền nữa. Đúng kiểu lỗi khó truy nhất.
 *
 * UIBackgroundModes khai ở app.json (ios.infoPlist), không lặp lại ở đây.
 */

const IMPORT_LINE = '#import "WebRTCModuleOptions.h"';
const ENABLE_LINE =
  "    WebRTCModuleOptions.sharedInstance().enableMultitaskingCameraAccess = true";

/** `WebRTCModuleOptions` là class Objective-C — Swift thấy được nhờ bridging header. */
function withBridgingHeaderImport(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const iosRoot = cfg.modRequest.platformProjectRoot;
      const headers = fs
        .readdirSync(iosRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => path.join(iosRoot, e.name, `${e.name}-Bridging-Header.h`))
        .filter((p) => fs.existsSync(p));

      if (headers.length === 0) {
        throw new Error(
          "[withMultitaskingCamera] Không tìm thấy bridging header. " +
            "Không có nó thì Swift không thấy WebRTCModuleOptions và camera nền sẽ im lặng không hoạt động.",
        );
      }

      for (const header of headers) {
        const contents = fs.readFileSync(header, "utf8");
        if (contents.includes(IMPORT_LINE)) continue;
        fs.writeFileSync(header, `${contents.trimEnd()}\n${IMPORT_LINE}\n`);
      }
      return cfg;
    },
  ]);
}

/** Chèn dòng bật cờ vào đầu `didFinishLaunchingWithOptions`. */
function withAppDelegateFlag(config) {
  return withAppDelegate(config, (cfg) => {
    const { contents, language } = cfg.modResults;

    if (language !== "swift") {
      throw new Error(
        `[withMultitaskingCamera] Chỉ hỗ trợ AppDelegate viết bằng Swift, gặp "${language}". ` +
          "Expo đổi template rồi — phải cập nhật plugin này, đừng bỏ qua.",
      );
    }
    if (contents.includes("enableMultitaskingCameraAccess")) return cfg;

    // Neo vào dòng đầu tiên trong thân didFinishLaunchingWithOptions. Dùng đúng
    // dòng khởi tạo delegate làm mốc thay vì regex lỏng, để nếu Expo đổi template
    // thì plugin BÁO LỖI chứ không lặng lẽ chèn trượt chỗ.
    const anchor = "    let delegate = ReactNativeDelegate()";
    if (!contents.includes(anchor)) {
      throw new Error(
        "[withMultitaskingCamera] Không tìm thấy mốc chèn trong AppDelegate.swift. " +
          "Template Expo đã đổi — kiểm tra lại trước khi tin là camera nền còn chạy.",
      );
    }

    cfg.modResults.contents = contents.replace(
      anchor,
      `${ENABLE_LINE}\n\n${anchor}`,
    );
    return cfg;
  });
}

module.exports = function withMultitaskingCamera(config) {
  return withAppDelegateFlag(withBridgingHeaderImport(config));
};
