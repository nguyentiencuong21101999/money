const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Sửa lỗi biên dịch pod `fmt` khi build RN 0.79 (SDK 53) bằng Xcode 26.
 *
 * clang 17 trong Xcode 26 siết `consteval`, khiến FMT_STRING trong fmt bản cũ
 * báo "call to consteval function is not a constant expression" → build fail.
 * Định nghĩa qua GCC_PREPROCESSOR_DEFINITIONS KHÔNG ăn vì base.h tự #define
 * FMT_CONSTEVAL không guard. Cách chắc chắn: vá thẳng header, ép nhánh consteval
 * tắt (đưa FMT_CONSTEVAL về rỗng).
 *
 * Phải làm ở post_install của Podfile (không phải config plugin thường): file
 * Pods/fmt/... chỉ tồn tại SAU khi pod install chạy, còn config plugin chạy ở
 * bước prebuild TRƯỚC đó.
 */
const MARKER = "withFmtFix";
const SNIPPET = `
    # ${MARKER}: fmt consteval hỏng với clang Xcode 26 → ép tắt bằng cách vá header
    fmt_base = File.join(installer.sandbox.root, 'fmt', 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base)
      _t = File.read(fmt_base)
      _p = _t.sub("#if FMT_USE_CONSTEVAL\\n#  define FMT_CONSTEVAL consteval",
                  "#if 0 // ${MARKER}\\n#  define FMT_CONSTEVAL consteval")
      File.write(fmt_base, _p) if _p != _t
    end
`;

module.exports = function withFmtFix(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
      let contents = fs.readFileSync(podfile, "utf8");
      if (!contents.includes(MARKER)) {
        contents = contents.replace(
          /post_install do \|installer\|\n/,
          (m) => m + SNIPPET,
        );
        fs.writeFileSync(podfile, contents);
      }
      return cfg;
    },
  ]);
};
