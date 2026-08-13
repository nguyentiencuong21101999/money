const { withDangerousMod, withXcodeProject } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Nhúng native module KeepAlivePip (Swift + bridge ObjC) vào app iOS.
 *
 * ios/ do prebuild sinh lại + nằm trong .gitignore nên nguồn thật đặt ở
 * mobile/native/, plugin copy vào ios/Secret/ và đăng ký vào Xcode target.
 */
const FILES = [
  "KeepAlivePip.swift",
  "KeepAlivePipBridge.m",
  "PipContent.swift",
];

// Mọi file trong mobile/native/pip-assets/ được nhét vào app bundle để
// PipContent.swift đọc bằng Bundle.main.url(forResource:) — chỗ để video/ảnh
// muốn hiện trong ô PiP.
const ASSET_DIR = "pip-assets";

function listAssets(projectRoot) {
  const dir = path.join(projectRoot, "native", ASSET_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(
      (f) =>
        !f.startsWith(".") &&
        !f.endsWith(".md") && // README hướng dẫn, không phải asset
        fs.statSync(path.join(dir, f)).isFile(),
    );
}

function withCopyFiles(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const iosRoot = cfg.modRequest.platformProjectRoot; // .../ios
      const projectName = cfg.modRequest.projectName; // "Secret"
      const srcDir = path.join(cfg.modRequest.projectRoot, "native");
      const destDir = path.join(iosRoot, projectName);
      for (const f of FILES) {
        fs.copyFileSync(path.join(srcDir, f), path.join(destDir, f));
      }
      for (const f of listAssets(cfg.modRequest.projectRoot)) {
        fs.copyFileSync(path.join(srcDir, ASSET_DIR, f), path.join(destDir, f));
      }
      return cfg;
    },
  ]);
}

function withRegisterFiles(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const projectName = cfg.modRequest.projectName;
    const target = project.getFirstTarget().uuid;
    const groupKey =
      project.findPBXGroupKey({ name: projectName }) ||
      project.findPBXGroupKey({ path: projectName });

    // Tránh thêm trùng khi prebuild chạy lại.
    const refs = project.pbxFileReferenceSection();
    const already = new Set(
      Object.keys(refs)
        .map((k) => refs[k] && refs[k].path)
        .filter(Boolean)
        .map((p) => p.replace(/"/g, "")),
    );
    const isNew = (f) =>
      !already.has(f) && !already.has(`${projectName}/${f}`);

    for (const f of FILES) {
      if (!isNew(f)) continue;
      project.addSourceFile(`${projectName}/${f}`, { target }, groupKey);
    }
    // Asset đi vào build phase "Resources", không phải "Sources".
    const assets = listAssets(cfg.modRequest.projectRoot).filter(isNew);
    if (assets.length) {
      // addResourceFile() của lib xcode gọi pbxGroupByName("Resources") rồi đọc
      // .path của nó — project do Expo prebuild sinh KHÔNG có group đó nên nổ
      // TypeError. Tạo sẵn một group rỗng (không path) để nó chạy qua.
      if (!project.pbxGroupByName("Resources")) {
        project.addPbxGroup([], "Resources");
      }
      for (const f of assets) {
        project.addResourceFile(`${projectName}/${f}`, { target }, groupKey);
      }
    }
    return cfg;
  });
}

module.exports = function withKeepAlivePip(config) {
  return withRegisterFiles(withCopyFiles(config));
};
