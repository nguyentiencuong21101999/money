import { NativeModules } from "react-native";

/**
 * Cầu JS tới native module KeepAlivePip (xem native/KeepAlivePip.swift).
 *
 * Giữ app sống dưới nền bằng một cửa sổ PiP nhỏ (hiện logo trái tim), để camera của
 * react-native-webrtc (đã bật isMultitaskingCameraAccessEnabled) tiếp tục stream
 * khi người dùng chuyển sang app khác. PiP tự vào nền nhờ
 * canStartPictureInPictureAutomaticallyFromInline; chỉ cần start() lúc bắt đầu
 * chia sẻ và stop() khi dừng.
 */
const { KeepAlivePip } = NativeModules as {
  KeepAlivePip?: {
    start(trackId: string): void;
    stop(): void;
    setImage(base64: string): void;
    setCameraZoom(deviceId: string, factor: number): void;
  };
};

/**
 * Zoom camera đang chia sẻ (theo deviceId + hệ số, 1 = không zoom). Chỉnh thẳng
 * videoZoomFactor trên AVCaptureDevice nên nét hơn phóng CSS ở người xem.
 */
export function setCameraZoom(deviceId: string, factor: number): void {
  KeepAlivePip?.setCameraZoom(deviceId, factor);
}

export const keepAlivePipAvailable = Boolean(KeepAlivePip);

/**
 * Đặt ảnh hiện trong ô PiP = ảnh đang xem ở feed.
 *
 * @param base64 bytes ảnh (JPEG/PNG/WebP) đã bỏ tiền tố data URL. JS tải ảnh vì
 *   API ảnh của web đòi idToken Firebase — native khỏi dính gì tới auth.
 *
 * Gọi mỗi khi vuốt sang ảnh khác: chưa bật PiP thì native chỉ ghi nhớ, đang bật
 * thì đổi ảnh ngay — nên lúc thoát app, ô PiP luôn là tấm đang xem.
 */
export function setPipImage(base64: string): void {
  KeepAlivePip?.setImage(base64);
}

/**
 * @param videoTrackId id của video track camera đang chia sẻ (MediaStreamTrack.id).
 *   Native dùng id này lấy track từ WebRTCModule để đẩy khung hình camera vào ô PiP.
 *   Bỏ trống → ô PiP dùng nội dung mặc định.
 */
export function startKeepAlivePip(videoTrackId = ""): void {
  KeepAlivePip?.start(videoTrackId);
}

export function stopKeepAlivePip(): void {
  KeepAlivePip?.stop();
}
