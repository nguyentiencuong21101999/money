const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

/**
 * App này dùng CHUNG `../src/lib/call.ts` với bản web — đó là lý do chọn React
 * Native thay vì Swift. Toàn bộ hợp đồng signaling (offer/answer/ICE/presence,
 * xem docs/signaling.md) chỉ tồn tại một bản; sửa một chỗ là hai bên cùng đổi,
 * không có chuyện bên xem web đứng hình vì bên native quên cập nhật.
 *
 * Metro mặc định không nhìn ra ngoài thư mục dự án, nên phải khai ba thứ dưới đây.
 */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");
const sharedSrc = path.resolve(workspaceRoot, "src");

const config = getDefaultConfig(projectRoot);

// 1. Cho Metro theo dõi code dùng chung + node_modules ở gốc (nơi có `firebase`).
config.watchFolders = [sharedSrc, path.resolve(workspaceRoot, "node_modules")];

// 2. Tìm package ở mobile/node_modules trước, rồi mới tới gốc. `disableHierarchicalLookup`
//    để Metro không tự mò ngược lên cây thư mục và vớ nhầm hai bản React khác nhau.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

// 3. `src/lib/call.ts` lấy Firestore từ `./firebase`, mà file đó đọc cấu hình qua
//    `process.env.NEXT_PUBLIC_*` — thứ chỉ Next.js mới thay lúc build. Nên mọi
//    import "./firebase" phát ra TỪ code dùng chung được lái về bản khởi tạo
//    riêng cho React Native. Nhờ vậy không phải sửa một dòng nào của bên web.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromShared = context.originModulePath?.startsWith(sharedSrc);
  const isFirebaseModule =
    moduleName === "./firebase" || moduleName === "@/lib/firebase";
  if (fromShared && isFirebaseModule) {
    return {
      type: "sourceFile",
      filePath: path.resolve(projectRoot, "src/firebase.ts"),
    };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
