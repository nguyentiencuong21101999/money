import RNCallKeep from "react-native-callkeep";
import { RTCAudioSession } from "react-native-webrtc";

/**
 * CallKit qua CallKeep — mảnh ghép làm cho camera chạy nền được.
 *
 * `voip` trong UIBackgroundModes + multitasking camera của iOS 18 CHƯA đủ: iOS
 * chỉ cấp thời gian chạy nền khi có một cuộc gọi CallKit đang HOẠT ĐỘNG được báo
 * lên hệ thống. Thiếu nó, chuyển sang app khác là iOS treo app → camera đứng
 * hình (đúng hiện tượng đã gặp). Vì vậy khi bắt đầu chia sẻ, ta báo cho iOS "đang
 * có cuộc gọi"; iOS mới để app + camera chạy tiếp dưới nền.
 *
 * Đây cũng là cơ chế Messenger/WhatsApp dùng. Lưu ý: KHÔNG cứu được khi người
 * dùng vuốt-tắt hẳn app — không API nào giữ được app đã bị giết.
 */

let didSetup = false;

async function setupOnce(): Promise<void> {
  if (didSetup) return;

  // MẤU CHỐT cho PiP: CallKit sở hữu audio session. Khi nó kích hoạt, PHẢI báo
  // cho WebRTC bằng RTCAudioSession.audioSessionDidActivate() — thiếu bước này
  // thì WebRTC coi audio session chưa active, và AVKit trả isPictureInPicturePossible
  // = false → PiP không bao giờ mở được (dù camera + frame đều ổn).
  RNCallKeep.addEventListener("didActivateAudioSession", () => {
    RTCAudioSession.audioSessionDidActivate();
  });
  RNCallKeep.addEventListener("didDeactivateAudioSession", () => {
    RTCAudioSession.audioSessionDidDeactivate();
  });

  await RNCallKeep.setup({
    ios: {
      appName: "Secret",
      supportsVideo: true,
      // Không nhét vào lịch sử app Điện thoại — đây là giữ-nền, không phải cuộc
      // gọi để gọi lại.
      includesCallsInRecents: false,
    },
    // iOS-only nhưng kiểu bắt buộc có nhánh android; để rỗng.
    android: {
      alertTitle: "",
      alertDescription: "",
      cancelButton: "",
      okButton: "",
      additionalPermissions: [],
    },
  });
  didSetup = true;
}

/** UUID v4 cho định danh cuộc gọi cục bộ — không cần độ bảo mật mật mã. */
function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Báo một cuộc gọi đi đang diễn ra → iOS cấp quyền chạy nền. Trả về uuid để sau
 * này kết thúc đúng cuộc gọi đó.
 */
export async function startKeepAliveCall(peerName: string): Promise<string> {
  await setupOnce();
  const uuid = uuidv4();
  RNCallKeep.startCall(uuid, peerName, peerName, "generic", true);
  // Đánh dấu đã kết nối để CallKit coi là cuộc gọi đang chạy (không kẹt ở "đang
  // gọi…").
  RNCallKeep.reportConnectedOutgoingCallWithUUID(uuid);
  // CallKit không bắn didActivateAudioSession cho cuộc gọi đi kiểu này, nên báo
  // thẳng cho WebRTC audio session đã active.
  setTimeout(() => RTCAudioSession.audioSessionDidActivate(), 800);
  return uuid;
}

export function endKeepAliveCall(uuid: string): void {
  try {
    RNCallKeep.endCall(uuid);
  } catch {
    // Cuộc gọi có thể đã bị hệ thống kết thúc — bỏ qua.
  }
}

/**
 * Người dùng bấm "Kết thúc" trên giao diện CallKit (màn khoá / viên thuốc xanh)
 * thì phải dừng chia sẻ theo. Trả về hàm huỷ đăng ký.
 */
export function onSystemEndCall(cb: () => void): () => void {
  RNCallKeep.addEventListener("endCall", cb);
  return () => RNCallKeep.removeEventListener("endCall");
}
