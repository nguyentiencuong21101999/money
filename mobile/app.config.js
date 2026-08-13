// Chuyển từ app.json sang đây để nạp được giá trị từ .env — plugin Google Sign-In
// đòi `iosUrlScheme` (REVERSED_CLIENT_ID của Firebase) ngay lúc build, mà giá trị
// đó là bí mật theo từng project nên không hardcode vào repo.
//
// Lấy từ đâu: Firebase Console → thêm app iOS (bundle com.secret.login) → tải
// GoogleService-Info.plist → mở ra, các giá trị cần nằm ở:
//   EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME  = REVERSED_CLIENT_ID
//   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID   = CLIENT_ID
//   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID   = client id của OAuth "Web" (Firebase Console
//                                        → Authentication → Sign-in method → Google)
// Điền cả ba vào mobile/.env.

const iosUrlScheme =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ||
  // Placeholder để prebuild không nổ khi chưa cấu hình. Phải đúng dạng plugin
  // chấp nhận (com.googleusercontent.apps.*) — nhưng đăng nhập Google chỉ chạy
  // thật khi đã thay bằng giá trị thực trong .env.
  "com.googleusercontent.apps.placeholder";

module.exports = {
  expo: {
    name: "Secret",
    slug: "secret",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    // Tắt New Architecture: phần PiP của react-native-webrtc dùng cơ chế cũ
    // (UIManager.dispatchViewManagerCommand + prop iosPIP qua paper view manager),
    // KHÔNG chạy dưới Fabric — lệnh startIOSPIP không tới native, auto-PiP cũng
    // không nổ. Tắt New Arch để cả PiP thủ công lẫn tự động hoạt động.
    newArchEnabled: false,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.secret.login",
      infoPlist: {
        UIBackgroundModes: ["voip", "audio"],
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: "com.secret.login",
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      [
        "@config-plugins/react-native-webrtc",
        {
          cameraPermission:
            "Ứng dụng cần camera để chia sẻ hình cho người bạn cho phép xem.",
          microphonePermission:
            "Ứng dụng cần micro để gửi kèm âm thanh khi bạn chia sẻ camera.",
        },
      ],
      "./plugins/withMultitaskingCamera",
      "./plugins/withDevelopmentTeam",
      "./plugins/withFmtFix",
      "./plugins/withKeepAlivePip",
      "@config-plugins/react-native-callkeep",
      ["@react-native-google-signin/google-signin", { iosUrlScheme }],
    ],
  },
};
