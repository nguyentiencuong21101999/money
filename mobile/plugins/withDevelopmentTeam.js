const { withXcodeProject } = require("@expo/config-plugins");

/**
 * Ghi cứng DEVELOPMENT_TEAM vào project iOS.
 *
 * Team ký app được đặt tay trong Xcode (Signing & Capabilities), nhưng thư mục
 * ios/ do `expo prebuild` sinh lại và nằm trong .gitignore — nên lần prebuild kế
 * tiếp sẽ xoá mất cấu hình ký, build lại báo "requires a development team". Ghi
 * ở đây để mỗi lần prebuild tự áp lại, khỏi phải vào Xcode chọn Team lần nữa.
 *
 * 22DWV94XU5 = Personal Team (Cường Nguyễn Tiến), tài khoản Apple miễn phí. Đây
 * KHÔNG phải bí mật (Team ID hiện công khai trong mọi app đã ký), nên để thẳng
 * trong repo được. Đổi máy/đổi tài khoản ký thì sửa đúng chuỗi này.
 */
const DEVELOPMENT_TEAM = "22DWV94XU5";

module.exports = function withDevelopmentTeam(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configurations)) {
      const buildSettings = configurations[key].buildSettings;
      if (!buildSettings) continue;
      // Chỉ đụng vào các target thật (có PRODUCT_BUNDLE_IDENTIFIER), bỏ qua mấy
      // mục comment của pbxproj.
      if (buildSettings.PRODUCT_BUNDLE_IDENTIFIER) {
        buildSettings.DEVELOPMENT_TEAM = DEVELOPMENT_TEAM;
      }
    }
    return cfg;
  });
};
