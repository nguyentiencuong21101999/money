import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { GoogleAuthProvider, signInWithCredential } from "@firebase/auth";
import { getFirebaseAuth } from "./firebase";

/**
 * Đăng nhập Google giống hệt bản web, nhưng web dùng `signInWithPopup` —
 * thứ KHÔNG chạy trên React Native (không có popup trình duyệt). Cách chuẩn ở
 * đây: mở màn Google native để lấy idToken, rồi đổi thành credential Firebase.
 * Cùng một tài khoản Google → cùng một Firebase user như web.
 *
 * webClientId là BẮT BUỘC: Firebase chỉ nhận idToken khi "audience" của token
 * là OAuth client dạng Web. Thiếu nó thì đăng nhập native chạy nhưng Firebase
 * từ chối.
 */
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

export const googleConfigured = Boolean(webClientId && iosClientId);

let configured = false;
function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({ webClientId, iosClientId });
  configured = true;
}

/** Ném lỗi có thông điệp tiếng Việt để màn đăng nhập hiển thị thẳng. */
export async function signInWithGoogle(): Promise<void> {
  if (!googleConfigured) {
    throw new Error(
      "Chưa cấu hình Google. Thiếu EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID / " +
        "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID trong mobile/.env.",
    );
  }
  ensureConfigured();

  try {
    await GoogleSignin.hasPlayServices(); // iOS coi như không làm gì
    const result = await GoogleSignin.signIn();
    // google-signin v13+ trả { type, data }; các bản cũ trả thẳng { idToken }.
    const idToken =
      (result as { data?: { idToken?: string } }).data?.idToken ??
      (result as { idToken?: string }).idToken;
    if (!idToken) throw new Error("Không lấy được idToken từ Google.");

    const credential = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(getFirebaseAuth(), credential);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === statusCodes.SIGN_IN_CANCELLED) return; // người dùng tự huỷ, không phải lỗi
    if (code === statusCodes.IN_PROGRESS) return;
    throw e;
  }
}

export async function signOutGoogle(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Kệ — signOut Firebase ở chỗ gọi mới là cái quyết định.
  }
}
