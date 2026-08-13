import AVKit
import Foundation
import React
import UIKit
import WebRTC

/**
 * PiP "keep-alive" tối giản để giữ app sống dưới nền → camera react-native-webrtc
 * (đã bật isMultitaskingCameraAccessEnabled) tiếp tục stream khi chuyển sang app
 * khác.
 *
 * Không hiển thị camera — chỉ nuôi một AVSampleBufferDisplayLayer bằng khung hình
 * riêng để AVPictureInPictureController đạt isPictureInPicturePossible=true rồi vào
 * PiP. Dùng kiểu SAMPLE-BUFFER (chuẩn PiP video thường), khác kiểu video-call của
 * rn-webrtc vốn không đạt "possible" trong môi trường này.
 *
 * File này chỉ lo cơ chế PiP. Nội dung thấy trong ô PiP (logo trái tim, video…)
 * nằm ở PipContent.swift — sửa ở đó, đừng sửa ở đây.
 */
@objc(KeepAlivePip)
class KeepAlivePip: NSObject, AVPictureInPictureControllerDelegate,
  AVPictureInPictureSampleBufferPlaybackDelegate
{
  private var pipController: AVPictureInPictureController?
  private var displayLayer: AVSampleBufferDisplayLayer?
  private var hostView: UIView?
  private var content: PipContent?
  private var videoTrackId: String?

  // RN tự tiêm bridge cho RCTBridgeModule — dùng để lấy WebRTCModule → track camera.
  @objc var bridge: RCTBridge!

  @objc static func requiresMainQueueSetup() -> Bool { return true }

  @objc func start(_ trackId: NSString) {
    let id = trackId as String
    DispatchQueue.main.async {
      self.videoTrackId = id.isEmpty ? nil : id
      self.setup()
    }
  }

  /// Lấy track camera cục bộ từ WebRTCModule bằng KVC (localTracks là property công
  /// khai) — để đẩy chính khung hình camera vào ô PiP thay vì tự vẽ.
  private func localVideoTrack() -> RTCVideoTrack? {
    guard let id = videoTrackId,
      let webrtc = bridge?.module(forName: "WebRTCModule") as? NSObject,
      let tracks = webrtc.value(forKey: "localTracks") as? [String: RTCMediaStreamTrack]
    else { return nil }
    return tracks[id] as? RTCVideoTrack
  }

  /// Ảnh hiện trong ô PiP, do JS gửi xuống (ảnh đang xem ở feed).
  ///
  /// JS tải ảnh chứ không phải native, vì đường lấy ảnh cần idToken Firebase.
  /// Gọi lúc nào cũng được: chưa bật PiP thì chỉ ghi nhớ, đang bật thì nội dung
  /// tự vẽ lại ở khung hình kế tiếp (PipCustomImageContent so PipArtwork.version).
  @objc func setImage(_ base64: NSString) {
    let raw = base64 as String
    DispatchQueue.global(qos: .userInitiated).async {
      guard let data = Data(base64Encoded: raw, options: [.ignoreUnknownCharacters]),
        PipArtwork.setLiveImage(data: data)
      else {
        NSLog("[KeepAlivePip] setImage: không decode được ảnh (%d ký tự base64)", raw.count)
        return
      }
      NSLog("[KeepAlivePip] setImage: nhận ảnh %d bytes", data.count)
    }
  }

  /// Đặt mức zoom camera đang quay (theo uniqueID = deviceId).
  ///
  /// Chỉnh thẳng `videoZoomFactor` trên AVCaptureDevice mà react-native-webrtc
  /// đang dùng — cùng một device (uniqueID trùng) nên zoom đổi ngay trên luồng
  /// đang phát, KHÔNG cần vá thư viện. Zoom này cắt ở gốc rồi mới nén nên nét hơn
  /// phóng CSS ở phía người xem.
  @objc func setCameraZoom(_ deviceId: NSString, factor: NSNumber) {
    guard let device = AVCaptureDevice(uniqueID: deviceId as String) else {
      NSLog("[KeepAlivePip] setCameraZoom: không thấy device %@", deviceId)
      return
    }
    do {
      try device.lockForConfiguration()
      // Kẹp trong [1, max của máy]. Vượt max thì set = max (khỏi nổ).
      let want = CGFloat(factor.doubleValue)
      device.videoZoomFactor = max(1.0, min(want, device.maxAvailableVideoZoomFactor))
      device.unlockForConfiguration()
    } catch {
      NSLog("[KeepAlivePip] setCameraZoom lỗi: %@", error.localizedDescription)
    }
  }

  /// Khoá / mở nét ở TÂM camera.
  ///
  /// locked=true: lấy nét (và đo sáng) một lần ở điểm giữa rồi GIỮ — hết cảnh dò
  /// nét mờ-rõ tới lui. locked=false: về tự động lấy nét liên tục như thường.
  @objc func setCameraFocus(_ deviceId: NSString, locked: NSNumber) {
    guard let device = AVCaptureDevice(uniqueID: deviceId as String) else {
      NSLog("[KeepAlivePip] setCameraFocus: không thấy device %@", deviceId)
      return
    }
    let center = CGPoint(x: 0.5, y: 0.5)
    do {
      try device.lockForConfiguration()
      if locked.boolValue {
        // Nét một phát ở tâm rồi giữ (.autoFocus = một lần rồi khoá, không dò tiếp).
        if device.isFocusPointOfInterestSupported { device.focusPointOfInterest = center }
        if device.isFocusModeSupported(.autoFocus) { device.focusMode = .autoFocus }
        // Đo sáng một phát ở tâm rồi giữ, cho hết cảnh sáng-tối nhấp nháy.
        if device.isExposurePointOfInterestSupported { device.exposurePointOfInterest = center }
        if device.isExposureModeSupported(.autoExpose) { device.exposureMode = .autoExpose }
      } else {
        if device.isFocusModeSupported(.continuousAutoFocus) {
          device.focusMode = .continuousAutoFocus
        }
        if device.isExposureModeSupported(.continuousAutoExposure) {
          device.exposureMode = .continuousAutoExposure
        }
      }
      device.unlockForConfiguration()
    } catch {
      NSLog("[KeepAlivePip] setCameraFocus lỗi: %@", error.localizedDescription)
    }
  }

  @objc func stop() {
    DispatchQueue.main.async {
      self.content?.stop()
      self.content = nil
      self.pipController?.stopPictureInPicture()
      self.pipController = nil
      self.displayLayer = nil
      self.hostView?.removeFromSuperview()
      self.hostView = nil
    }
  }

  private func setup() {
    guard #available(iOS 15.0, *),
      AVPictureInPictureController.isPictureInPictureSupported(),
      pipController == nil
    else { return }

    // Audio session kiểu playback + active: bắt buộc để PiP "khả thi".
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.playAndRecord, mode: .videoChat, options: [.mixWithOthers])
    try? session.setActive(true)

    // Layer nuôi khung hình. Phải nằm trong cây view (dù nhỏ/khuất) để possible=true.
    let layer = AVSampleBufferDisplayLayer()
    layer.frame = CGRect(x: 0, y: 0, width: 90, height: 160)
    layer.videoGravity = .resizeAspect

    // Lớp PiP PHẢI được render thì iOS mới có nội dung để đưa vào ô PiP: giấu sau
    // root view (insertSubview at:0) hay hạ alpha ~0 đều từng làm ô PiP ra đen dù
    // frame vẫn được enqueue.
    //
    // Nên "ẩn" ở đây = thu nhỏ còn một điểm ở sát đáy màn hình: vẫn nằm trên cùng và
    // được vẽ như cũ, nhưng 3x6pt thì mắt không thấy. Cỡ trên màn hình KHÔNG ảnh
    // hưởng nét của ô PiP — nét do pixel buffer quyết định (camera 1280x720).
    let vw: CGFloat = 3
    let vh: CGFloat = 6
    let winBounds = Self.keyWindow()?.bounds ?? CGRect(x: 0, y: 0, width: 300, height: 600)
    let host = UIView(
      frame: CGRect(x: 2, y: winBounds.height - vh - 2, width: vw, height: vh))
    host.backgroundColor = .black
    host.clipsToBounds = true
    // Không chắn chạm của UI phía dưới.
    host.isUserInteractionEnabled = false
    layer.frame = host.bounds
    host.layer.addSublayer(layer)

    if let window = Self.keyWindow() {
      window.addSubview(host)  // trên cùng → được render
    }

    self.displayLayer = layer
    self.hostView = host

    // Nội dung do PipContent.swift quyết định (ảnh custom / camera thật / video…).
    // Track camera được truyền vào vì các nội dung dùng nó làm nguồn hoặc làm nhịp
    // khung hình.
    let track = localVideoTrack()
    if track == nil {
      NSLog("[KeepAlivePip] không lấy được track camera (id=%@)", videoTrackId ?? "nil")
    }
    let chosen = makePipContent(cameraTrack: track)
    if chosen.start(on: layer) {
      self.content = chosen
    } else {
      // Không cần track, luôn chạy được → PiP vẫn bật để giữ camera nền.
      let fallback = PipLogoContent()
      _ = fallback.start(on: layer)
      self.content = fallback
    }

    let source = AVPictureInPictureController.ContentSource(
      sampleBufferDisplayLayer: layer, playbackDelegate: self)
    let pip = AVPictureInPictureController(contentSource: source)
    pip.canStartPictureInPictureAutomaticallyFromInline = true
    pip.delegate = self
    self.pipController = pip

    // Auto-PiP (canStart...FromInline) hay chập chờn, nên CHỦ ĐỘNG vào PiP ở nhịp
    // app sắp rời tiền cảnh — đây là thời điểm cuối còn "khả thi" để bật.
    NotificationCenter.default.addObserver(
      self, selector: #selector(willResignActive),
      name: UIApplication.willResignActiveNotification, object: nil)
  }

  @objc private func willResignActive() {
    guard let pip = pipController, pip.isPictureInPicturePossible,
      !pip.isPictureInPictureActive
    else { return }
    pip.startPictureInPicture()
  }

  private static func keyWindow() -> UIWindow? {
    return UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow } ?? UIApplication.shared.windows.first
  }

  // MARK: - AVPictureInPictureControllerDelegate (chỉ để soi log)

  func pictureInPictureControllerDidStartPictureInPicture(
    _ pictureInPictureController: AVPictureInPictureController
  ) {
    NSLog("[KeepAlivePip] PiP đã bật")
  }

  func pictureInPictureController(
    _ pictureInPictureController: AVPictureInPictureController,
    failedToStartPictureInPictureWithError error: Error
  ) {
    NSLog("[KeepAlivePip] PiP bật thất bại: %@", error.localizedDescription)
  }

  func pictureInPictureControllerDidStopPictureInPicture(
    _ pictureInPictureController: AVPictureInPictureController
  ) {
    NSLog("[KeepAlivePip] PiP đã tắt")
  }

  // MARK: - AVPictureInPictureSampleBufferPlaybackDelegate (bắt buộc)

  func pictureInPictureController(
    _ pictureInPictureController: AVPictureInPictureController, setPlaying playing: Bool
  ) {}

  func pictureInPictureControllerTimeRangeForPlayback(
    _ pictureInPictureController: AVPictureInPictureController
  ) -> CMTimeRange {
    // Live: bắt đầu 0, dài vô hạn.
    return CMTimeRange(start: .zero, duration: .positiveInfinity)
  }

  func pictureInPictureControllerIsPlaybackPaused(
    _ pictureInPictureController: AVPictureInPictureController
  ) -> Bool {
    return false
  }

  func pictureInPictureController(
    _ pictureInPictureController: AVPictureInPictureController,
    didTransitionToRenderSize newRenderSize: CMVideoDimensions
  ) {
    NSLog(
      "[KeepAlivePip] renderSize = %dx%d", Int(newRenderSize.width), Int(newRenderSize.height))
  }

  func pictureInPictureController(
    _ pictureInPictureController: AVPictureInPictureController,
    skipByInterval skipInterval: CMTime, completion completionHandler: @escaping () -> Void
  ) {
    completionHandler()
  }
}
