import AVFoundation
import CoreGraphics
import CoreImage
import CoreMedia
import CoreVideo
import Foundation
import ImageIO
import QuartzCore
import WebRTC

/**
 * Nội dung hiển thị trong ô PiP "keep-alive" (xem KeepAlivePip.swift).
 *
 * KeepAlivePip chỉ lo phần "vào được PiP và giữ app sống"; còn *thấy gì* trong ô
 * PiP thì nằm hết ở file này. Muốn đổi hình/video chỉ cần sửa makePipContent()
 * bên dưới, không phải chạm vào KeepAlivePip.swift.
 */

// MARK: - ⬇️ CHỖ CẦN SỬA: chọn nội dung cho ô PiP

/// KeepAlivePip gọi hàm này để lấy nội dung sẽ hiện trong ô PiP.
///
/// - Parameter cameraTrack: track camera đang chia sẻ (nil nếu chưa có). Các nội
///   dung dùng camera làm nguồn/nhịp khung hình cần nó.
///
/// Nếu nội dung trả về không dùng được (thiếu track, thiếu file…), KeepAlivePip tự
/// quay về PipLogoContent — PiP vẫn bật nên camera dưới nền không bị chết.
func makePipContent(cameraTrack: RTCVideoTrack?) -> PipContent {
  // ---------------------------------------------------------------------------
  // MẶC ĐỊNH: ẢNH đang xem ở feed (JS đẩy xuống qua KeepAlivePip.setImage →
  // PipArtwork.liveImage). Chưa có ảnh nào thì PipCustomImageContent tự vẽ logo
  // trái tim, nên ô PiP không bao giờ đen.
  //
  // Vì sao cần cameraTrack: khung hình camera được dùng làm ĐỒNG HỒ bơm frame — đi
  // đúng đường ống đã chạy được. Hình camera KHÔNG ra ô PiP, chỉ ảnh của mình.
  if let track = cameraTrack {
    return PipCustomImageContent(clockTrack: track)
  }
  return PipLogoContent()
  // ---------------------------------------------------------------------------

  // MUỐN PHÁT VIDEO thay vì ảnh: bỏ comment dòng dưới (và bỏ khối trên đi). Video
  // lấy từ pip-assets/pip.mp4, xem hướng dẫn trong pip-assets/README.md.
  //
  // if let track = cameraTrack {
  //   return PipVideoPlayerContent(name: "pip", ext: "mp4", clockTrack: track)
  // }
  // return PipLogoContent()

  // MUỐN HIỆN HÌNH CAMERA THẬT:
  //
  // if let track = cameraTrack { return PipCameraContent(track: track) }
  // return PipLogoContent()

  // MUỐN VIDEO MÀ KHÔNG PHỤ THUỘC CAMERA: PipVideoContent tự đọc file bằng
  // AVAssetReader nên chạy được cả khi không có track, nhưng CHƯA được kiểm chứng
  // trên máy thật (đường bơm frame khác, có nguy cơ ô PiP đen).
  //
  // return PipVideoContent(name: "pip", ext: "mp4")

  // MUỐN ĐỂ THỨ KHÁC (text, animation…): viết một class mới theo protocol PipContent
  // bên dưới rồi return nó ở đây. Việc duy nhất phải làm là bơm CMSampleBuffer vào
  // layer đều đặn — layer ngừng có dữ liệu thì iOS coi PiP là "không khả thi" và app
  // có thể bị treo dưới nền.
}

// MARK: - Protocol

/// Một nguồn khung hình cho ô PiP.
protocol PipContent: AnyObject {
  /// Bắt đầu bơm khung hình vào layer.
  /// - Returns: false nếu không dùng được (thiếu file, decode lỗi…) để
  ///   KeepAlivePip quay về nội dung mặc định.
  func start(on layer: AVSampleBufferDisplayLayer) -> Bool

  /// Dừng bơm và thả tài nguyên. Được gọi khi tắt chia sẻ.
  func stop()
}

// MARK: - Nội dung 1: logo trái tim (mặc định)

/// Vẽ logo app (trái tim trắng trên gradient hồng → magenta, như assets/icon.png)
/// và bơm lại đúng khung hình đó ~15fps.
final class PipLogoContent: PipContent {
  // Tỉ lệ DỌC 9:16 → iOS vẽ ô PiP hẹp (như video call Facebook), thay vì ô vuông
  // bè. iPhone vẫn có cỡ tối thiểu nên không tí hon được, nhưng hẹp hơn nhiều.
  // Kích thước lớn hơn ô PiP thật để trái tim không bị rỗ khi iOS scale lên.
  private static let frameWidth = 270
  private static let frameHeight = 480

  // Nội dung mỗi khung hình y hệt nhau nên vẽ một lần rồi dùng lại pixel buffer;
  // mỗi frame chỉ bọc thêm CMSampleBuffer mới cho đúng timestamp.
  private var pixelBuffer: CVPixelBuffer?
  private var formatDesc: CMVideoFormatDescription?
  /// Phiên bản ảnh đã vẽ; khác PipArtwork.version nghĩa là JS vừa đổi ảnh (vuốt
  /// sang tấm khác) → phải vẽ lại, không dùng khung cache cũ.
  private var lastArtworkVersion = -1

  private weak var layer: AVSampleBufferDisplayLayer?
  private var timer: Timer?

  func start(on layer: AVSampleBufferDisplayLayer) -> Bool {
    guard makeFrame() != nil else { return false }
    self.layer = layer

    // Không có timebase, layer lấy mốc thời gian 0 với rate 0 → frame mang PTS theo
    // host clock (giá trị rất lớn) bị coi là "ở tương lai" và KHÔNG BAO GIỜ được vẽ,
    // ô PiP chỉ thấy màu đen nền. Gắn timebase chạy theo host clock để PTS khớp.
    var timebase: CMTimebase?
    CMTimebaseCreateWithSourceClock(
      allocator: kCFAllocatorDefault, sourceClock: CMClockGetHostTimeClock(),
      timebaseOut: &timebase)
    if let tb = timebase {
      CMTimebaseSetTime(tb, time: CMClockGetTime(CMClockGetHostTimeClock()))
      CMTimebaseSetRate(tb, rate: 1.0)
      layer.controlTimebase = tb
    }

    // Bơm đều để layer luôn có dữ liệu → isPictureInPicturePossible = true.
    let t = Timer.scheduledTimer(withTimeInterval: 1.0 / 15.0, repeats: true) {
      [weak self] _ in self?.enqueueFrame()
    }
    RunLoop.main.add(t, forMode: .common)
    timer = t
    return true
  }

  func stop() {
    timer?.invalidate()
    timer = nil
    layer = nil
    pixelBuffer = nil
    formatDesc = nil
  }

  private func enqueueFrame() {
    guard let layer = layer else { return }

    // Layer chết (decode/queue lỗi) thì có bơm tiếp cũng vô ích — flush để nó nhận lại.
    if layer.status == .failed {
      NSLog("[PipLogoContent] layer failed: %@ → flush", String(describing: layer.error))
      layer.flush()
    }
    guard let sample = makeFrame() else { return }

    // iOS 17+ (máy iOS 26.5): AVSampleBufferDisplayLayer.enqueue() bị deprecated và
    // KHÔNG vẽ nội dung ra (chỉ giữ layer sống → thấy đen). Phải đẩy qua
    // sampleBufferRenderer thì khung hình mới thật sự hiển thị.
    if #available(iOS 17.0, *) {
      guard layer.sampleBufferRenderer.isReadyForMoreMediaData else { return }
      layer.sampleBufferRenderer.enqueue(sample)
    } else {
      guard layer.isReadyForMoreMediaData else { return }
      layer.enqueue(sample)
    }
  }

  private func makeFrame() -> CMSampleBuffer? {
    let pb: CVPixelBuffer
    let fd: CMVideoFormatDescription
    // Dùng lại khung cache CHỈ khi ảnh chưa đổi. JS đổi ảnh (setImage) thì
    // PipArtwork.version tăng → vẽ lại tấm mới.
    if let cachedPB = pixelBuffer, let cachedFD = formatDesc,
      lastArtworkVersion == PipArtwork.version
    {
      pb = cachedPB
      fd = cachedFD
    } else {
      guard let newPB = Self.makeLogoPixelBuffer() else { return nil }
      var desc: CMVideoFormatDescription?
      CMVideoFormatDescriptionCreateForImageBuffer(
        allocator: kCFAllocatorDefault, imageBuffer: newPB, formatDescriptionOut: &desc)
      guard let newFD = desc else { return nil }
      pixelBuffer = newPB
      formatDesc = newFD
      lastArtworkVersion = PipArtwork.version
      pb = newPB
      fd = newFD
    }

    var timing = CMSampleTimingInfo(
      duration: CMTime(value: 1, timescale: 15),
      presentationTimeStamp: CMClockGetTime(CMClockGetHostTimeClock()),
      decodeTimeStamp: .invalid)
    var sampleBuffer: CMSampleBuffer?
    CMSampleBufferCreateForImageBuffer(
      allocator: kCFAllocatorDefault, imageBuffer: pb, dataReady: true,
      makeDataReadyCallback: nil, refcon: nil, formatDescription: fd,
      sampleTiming: &timing, sampleBufferOut: &sampleBuffer)

    // Ảnh tĩnh nên bỏ qua timing luôn: hiện ngay khi tới layer, không chờ timebase.
    if let sample = sampleBuffer,
      let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: true),
      CFArrayGetCount(attachments) > 0
    {
      let dict = unsafeBitCast(CFArrayGetValueAtIndex(attachments, 0), to: CFMutableDictionary.self)
      CFDictionarySetValue(
        dict, Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(),
        Unmanaged.passUnretained(kCFBooleanTrue).toOpaque())
    }
    return sampleBuffer
  }

  /// Vẽ ảnh cho ô PiP vào pixel buffer BGRA (dùng chung PipArtwork với nội dung
  /// ảnh custom — ảnh trong pip-assets nếu có, không thì logo trái tim).
  private static func makeLogoPixelBuffer() -> CVPixelBuffer? {
    let w = frameWidth, h = frameHeight
    var pixelBuffer: CVPixelBuffer?
    let attrs: [String: Any] = [
      // IOSurface: BẮT BUỘC. PiP chạy ở tiến trình riêng, chỉ hiển thị được buffer
      // chia sẻ qua IOSurface. Thiếu dòng này → ô PiP ĐEN dù layer vẫn nhận frame.
      kCVPixelBufferIOSurfacePropertiesKey as String: [:] as CFDictionary,
      kCVPixelBufferCGImageCompatibilityKey as String: true,
      kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
    ]
    CVPixelBufferCreate(
      kCFAllocatorDefault, w, h, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &pixelBuffer)
    guard let pb = pixelBuffer else { return nil }

    CVPixelBufferLockBaseAddress(pb, [])
    defer { CVPixelBufferUnlockBaseAddress(pb, []) }
    guard let base = CVPixelBufferGetBaseAddress(pb) else { return nil }
    memset(base, 0, CVPixelBufferGetBytesPerRow(pb) * h)

    // 32BGRA ⇔ bitmapInfo .byteOrder32Little + premultipliedFirst.
    guard
      let ctx = CGContext(
        data: base, width: w, height: h, bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(pb), space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
          | CGBitmapInfo.byteOrder32Little.rawValue)
    else { return nil }

    if let image = PipArtwork.makeImage(width: w, height: h) {
      ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
    }
    return pb
  }
}

// MARK: - Nội dung 2: video lặp vô hạn

/// Phát một video trong app bundle, lặp mãi, vào ô PiP.
///
/// Không dùng AVPlayer: PiP ở đây là kiểu SAMPLE-BUFFER (xem KeepAlivePip.swift),
/// nên frame phải tự đọc bằng AVAssetReader rồi enqueue vào layer. Sample được lấy
/// nguyên dạng đã nén (H.264/HEVC) — layer tự giải mã, rẻ hơn tự convert sang BGRA.
final class PipVideoContent: PipContent {
  private let name: String
  private let ext: String
  /// Reader chạy ngoài main thread — layer sẽ gọi lại pump() trên queue này mỗi khi
  /// nó cần thêm dữ liệu.
  private let queue = DispatchQueue(label: "app.pip.video-reader")

  private var asset: AVAsset?
  private var reader: AVAssetReader?
  private var output: AVAssetReaderTrackOutput?
  private weak var layer: AVSampleBufferDisplayLayer?

  /// Mỗi vòng lặp reader chạy lại từ mốc 0, nhưng timeline của layer phải LUÔN
  /// tăng → cộng thêm offset này vào PTS của từng sample.
  private var loopOffset: CMTime = .zero
  /// PTS kết thúc của sample mới nhất → thành offset cho vòng lặp kế tiếp.
  private var nextLoopOffset: CMTime = .zero
  private var stopped = false

  init(name: String, ext: String) {
    self.name = name
    self.ext = ext
  }

  func start(on layer: AVSampleBufferDisplayLayer) -> Bool {
    guard let url = Bundle.main.url(forResource: name, withExtension: ext) else {
      NSLog("[PipVideoContent] không thấy %@.%@ trong bundle → dùng logo", name, ext)
      return false
    }
    let asset = AVURLAsset(url: url)
    guard startReader(for: asset) else {
      NSLog("[PipVideoContent] không đọc được %@.%@ → dùng logo", name, ext)
      return false
    }

    // Timebase là bắt buộc: không có nó layer hiện frame ngay khi nhận được, video
    // sẽ chạy nhanh hết cỡ thay vì đúng nhịp.
    var timebase: CMTimebase?
    CMTimebaseCreateWithSourceClock(
      allocator: kCFAllocatorDefault, sourceClock: CMClockGetHostTimeClock(),
      timebaseOut: &timebase)
    guard let tb = timebase else { return false }
    CMTimebaseSetTime(tb, time: .zero)
    CMTimebaseSetRate(tb, rate: 1.0)
    layer.controlTimebase = tb

    self.asset = asset
    self.layer = layer
    // iOS 17+ phải đi qua sampleBufferRenderer, không thì frame không hiện (xem
    // PipLogoContent.enqueueFrame).
    if #available(iOS 17.0, *) {
      layer.sampleBufferRenderer.requestMediaDataWhenReady(on: queue) {
        [weak self] in self?.pump()
      }
    } else {
      layer.requestMediaDataWhenReady(on: queue) { [weak self] in self?.pump() }
    }
    return true
  }

  func stop() {
    stopped = true
    if #available(iOS 17.0, *) {
      layer?.sampleBufferRenderer.stopRequestingMediaData()
    } else {
      layer?.stopRequestingMediaData()
    }
    layer = nil
    // Thả reader trên đúng queue đang đọc để không đụng nhau với pump().
    queue.async { [weak self] in
      self?.reader?.cancelReading()
      self?.reader = nil
      self?.output = nil
      self?.asset = nil
    }
  }

  private func startReader(for asset: AVAsset) -> Bool {
    guard let track = asset.tracks(withMediaType: .video).first,
      let reader = try? AVAssetReader(asset: asset)
    else { return false }

    // outputSettings = nil → sample giữ nguyên dạng nén kèm format description.
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else { return false }
    reader.add(output)
    guard reader.startReading() else { return false }

    self.reader = reader
    self.output = output
    return true
  }

  private func pump() {
    // Nếu vừa restart mà clip không ra frame nào thì dừng, tránh quay vòng vô hạn.
    var emptyRestarts = 0

    while !stopped, let layer = layer, Self.isReady(layer) {
      guard let sample = output?.copyNextSampleBuffer() else {
        guard emptyRestarts < 1, let asset = asset else { return }
        emptyRestarts += 1
        // Hết clip → đọc lại từ đầu, PTS tiếp nối timeline cũ.
        loopOffset = nextLoopOffset
        reader?.cancelReading()
        reader = nil
        output = nil
        guard startReader(for: asset) else { return }
        continue
      }
      emptyRestarts = 0

      guard let retimed = Self.retime(sample, by: loopOffset) else { continue }
      if #available(iOS 17.0, *) {
        layer.sampleBufferRenderer.enqueue(retimed)
      } else {
        layer.enqueue(retimed)
      }

      let pts = CMSampleBufferGetPresentationTimeStamp(retimed)
      let duration = CMSampleBufferGetDuration(retimed)
      if pts.isNumeric {
        let end = duration.isNumeric ? CMTimeAdd(pts, duration) : pts
        if CMTimeCompare(end, nextLoopOffset) > 0 { nextLoopOffset = end }
      }
    }
  }

  private static func isReady(_ layer: AVSampleBufferDisplayLayer) -> Bool {
    if #available(iOS 17.0, *) { return layer.sampleBufferRenderer.isReadyForMoreMediaData }
    return layer.isReadyForMoreMediaData
  }

  /// Copy sample với PTS/DTS dịch thêm `offset` (giữ nguyên dữ liệu hình).
  private static func retime(_ sample: CMSampleBuffer, by offset: CMTime) -> CMSampleBuffer? {
    if offset == .zero { return sample }

    var count: CMItemCount = 0
    guard
      CMSampleBufferGetSampleTimingInfoArray(
        sample, entryCount: 0, arrayToFill: nil, entriesNeededOut: &count) == noErr, count > 0
    else { return sample }

    var infos = [CMSampleTimingInfo](repeating: CMSampleTimingInfo(), count: count)
    guard
      CMSampleBufferGetSampleTimingInfoArray(
        sample, entryCount: count, arrayToFill: &infos, entriesNeededOut: &count) == noErr
    else { return sample }

    for i in 0..<infos.count {
      if infos[i].presentationTimeStamp.isNumeric {
        infos[i].presentationTimeStamp = CMTimeAdd(infos[i].presentationTimeStamp, offset)
      }
      if infos[i].decodeTimeStamp.isNumeric {
        infos[i].decodeTimeStamp = CMTimeAdd(infos[i].decodeTimeStamp, offset)
      }
    }

    var copy: CMSampleBuffer?
    CMSampleBufferCreateCopyWithNewTiming(
      allocator: kCFAllocatorDefault, sampleBuffer: sample, sampleTimingEntryCount: count,
      sampleTimingArray: &infos, sampleBufferOut: &copy)
    return copy ?? sample
  }
}

// MARK: - Nội dung 3: camera thật (đẩy khung hình đang chia sẻ vào ô PiP)

/// Nhận khung hình từ RTCVideoTrack (camera đang share) và enqueue thẳng vào layer.
/// Khung hình camera là CVPixelBuffer NV12 (YUV) — đúng định dạng AVSampleBufferDisplayLayer
/// hiển thị được, nên ô PiP hiện camera thật (khác ảnh tĩnh tự vẽ vốn ra đen).
final class PipCameraContent: NSObject, PipContent, RTCVideoRenderer {
  private let track: RTCVideoTrack
  private weak var layer: AVSampleBufferDisplayLayer?
  private var formatDesc: CMVideoFormatDescription?
  private var lastW: Int32 = 0
  private var lastH: Int32 = 0

  init(track: RTCVideoTrack) {
    self.track = track
    super.init()
  }

  func start(on layer: AVSampleBufferDisplayLayer) -> Bool {
    self.layer = layer
    track.add(self)
    return true
  }

  func stop() {
    track.remove(self)
    layer = nil
  }

  // MARK: RTCVideoRenderer
  func setSize(_ size: CGSize) {}

  func renderFrame(_ frame: RTCVideoFrame?) {
    guard let frame = frame, let layer = layer,
      let pb = (frame.buffer as? RTCCVPixelBuffer)?.pixelBuffer
    else { return }

    let w = Int32(CVPixelBufferGetWidth(pb))
    let h = Int32(CVPixelBufferGetHeight(pb))
    if formatDesc == nil || w != lastW || h != lastH {
      var fd: CMVideoFormatDescription?
      CMVideoFormatDescriptionCreateForImageBuffer(
        allocator: kCFAllocatorDefault, imageBuffer: pb, formatDescriptionOut: &fd)
      formatDesc = fd
      lastW = w
      lastH = h
    }
    guard let fd = formatDesc else { return }

    var timing = CMSampleTimingInfo(
      duration: .invalid,
      presentationTimeStamp: CMClockGetTime(CMClockGetHostTimeClock()),
      decodeTimeStamp: .invalid)
    var sample: CMSampleBuffer?
    CMSampleBufferCreateForImageBuffer(
      allocator: kCFAllocatorDefault, imageBuffer: pb, dataReady: true,
      makeDataReadyCallback: nil, refcon: nil, formatDescription: fd,
      sampleTiming: &timing, sampleBufferOut: &sample)
    guard let s = sample else { return }

    if let atts = CMSampleBufferGetSampleAttachmentsArray(s, createIfNecessary: true),
      CFArrayGetCount(atts) > 0
    {
      let d = unsafeBitCast(CFArrayGetValueAtIndex(atts, 0), to: CFMutableDictionary.self)
      CFDictionarySetValue(
        d, Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(),
        Unmanaged.passUnretained(kCFBooleanTrue).toOpaque())
    }

    DispatchQueue.main.async {
      if #available(iOS 17.0, *) {
        if layer.sampleBufferRenderer.isReadyForMoreMediaData {
          layer.sampleBufferRenderer.enqueue(s)
        }
      } else if layer.isReadyForMoreMediaData {
        layer.enqueue(s)
      }
    }
  }
}

// MARK: - Nội dung 4: ảnh custom, đẩy theo nhịp camera

/// Hiện MỘT ẢNH CUSTOM trong ô PiP (không phải hình camera).
///
/// Vì sao vẫn cần track camera: đường ống của PipCameraContent là đường duy nhất đã
/// chắc chắn hiển thị được — khung hình tới theo nhịp camera, pixel buffer đúng định
/// dạng camera (NV12/420f), timestamp theo host clock. Class này giữ nguyên đường đó
/// và chỉ THAY NỘI DUNG PIXEL: mỗi khung hình camera đến, nó bơm ảnh của mình (đã
/// render sẵn vào buffer cùng định dạng/cùng cỡ) thay cho khung hình camera.
///
/// Nhờ vậy hình camera KHÔNG bao giờ ra ô PiP, nhưng vẫn thừa hưởng mọi thứ khiến
/// đường camera hoạt động.
final class PipCustomImageContent: NSObject, PipContent, RTCVideoRenderer {
  private let track: RTCVideoTrack
  private weak var layer: AVSampleBufferDisplayLayer?
  private let ciContext = CIContext(options: nil)

  /// Ảnh đã render vào buffer đúng định dạng camera — vẽ một lần rồi dùng lại.
  private var artwork: CVPixelBuffer?
  private var formatDesc: CMVideoFormatDescription?
  private var lastW = 0
  private var lastH = 0
  private var lastFormat: OSType = 0
  /// Phiên bản ảnh đã vẽ; khác PipArtwork.version nghĩa là JS vừa đổi ảnh.
  private var lastArtworkVersion = -1

  init(clockTrack: RTCVideoTrack) {
    self.track = clockTrack
    super.init()
  }

  func start(on layer: AVSampleBufferDisplayLayer) -> Bool {
    self.layer = layer
    track.add(self)
    return true
  }

  func stop() {
    track.remove(self)
    layer = nil
    artwork = nil
    formatDesc = nil
  }

  // MARK: RTCVideoRenderer

  func setSize(_ size: CGSize) {}

  func renderFrame(_ frame: RTCVideoFrame?) {
    guard let frame = frame, let layer = layer,
      let cameraPB = (frame.buffer as? RTCCVPixelBuffer)?.pixelBuffer
    else { return }

    let w = CVPixelBufferGetWidth(cameraPB)
    let h = CVPixelBufferGetHeight(cameraPB)
    let format = CVPixelBufferGetPixelFormatType(cameraPB)

    // Vẽ lại khi: chưa có, camera đổi cỡ/định dạng (đổi cam trước-sau, xoay máy),
    // hoặc JS vừa đẩy ảnh mới xuống (vuốt sang ảnh khác ở feed).
    if artwork == nil || w != lastW || h != lastH || format != lastFormat
      || lastArtworkVersion != PipArtwork.version
    {
      guard let pb = makeArtworkBuffer(width: w, height: h, format: format) else { return }
      var fd: CMVideoFormatDescription?
      CMVideoFormatDescriptionCreateForImageBuffer(
        allocator: kCFAllocatorDefault, imageBuffer: pb, formatDescriptionOut: &fd)
      guard let desc = fd else { return }
      artwork = pb
      formatDesc = desc
      lastW = w
      lastH = h
      lastFormat = format
      lastArtworkVersion = PipArtwork.version
      NSLog(
        "[PipCustomImageContent] vẽ lại ảnh %dx%d, format=%d, v=%d", w, h, Int(format),
        PipArtwork.version)
    }
    guard let pb = artwork, let fd = formatDesc else { return }

    var timing = CMSampleTimingInfo(
      duration: .invalid,
      presentationTimeStamp: CMClockGetTime(CMClockGetHostTimeClock()),
      decodeTimeStamp: .invalid)
    var sample: CMSampleBuffer?
    CMSampleBufferCreateForImageBuffer(
      allocator: kCFAllocatorDefault, imageBuffer: pb, dataReady: true,
      makeDataReadyCallback: nil, refcon: nil, formatDescription: fd,
      sampleTiming: &timing, sampleBufferOut: &sample)
    guard let s = sample else { return }

    if let atts = CMSampleBufferGetSampleAttachmentsArray(s, createIfNecessary: true),
      CFArrayGetCount(atts) > 0
    {
      let d = unsafeBitCast(CFArrayGetValueAtIndex(atts, 0), to: CFMutableDictionary.self)
      CFDictionarySetValue(
        d, Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(),
        Unmanaged.passUnretained(kCFBooleanTrue).toOpaque())
    }

    DispatchQueue.main.async {
      if #available(iOS 17.0, *) {
        if layer.sampleBufferRenderer.isReadyForMoreMediaData {
          layer.sampleBufferRenderer.enqueue(s)
        }
      } else if layer.isReadyForMoreMediaData {
        layer.enqueue(s)
      }
    }
  }

  /// Tạo buffer cùng định dạng/cỡ với camera rồi render ảnh custom vào.
  private func makeArtworkBuffer(width: Int, height: Int, format: OSType) -> CVPixelBuffer? {
    guard let image = PipArtwork.makeImage(width: width, height: height) else { return nil }

    var out: CVPixelBuffer?
    let attrs: [String: Any] = [
      // IOSurface: buffer phải chia sẻ được với process vẽ ô PiP.
      kCVPixelBufferIOSurfacePropertiesKey as String: [:] as CFDictionary,
      kCVPixelBufferCGImageCompatibilityKey as String: true,
      kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
    ]
    CVPixelBufferCreate(
      kCFAllocatorDefault, width, height, format, attrs as CFDictionary, &out)
    guard let pb = out else { return nil }

    // CIContext lo luôn RGB → YUV nếu buffer là NV12/420f (đã kiểm chứng giữ đúng
    // chiều dọc, không bị lộn ngược).
    ciContext.render(CIImage(cgImage: image), to: pb)
    return pb
  }
}

// MARK: - Ảnh dùng cho ô PiP

/// Nguồn ảnh cho ô PiP: file trong bundle nếu có, không thì logo trái tim tự vẽ.
enum PipArtwork {
  /// Tên file ảnh trong pip-assets/ (không kể đuôi).
  static let imageName = "pip"
  private static let extensions = ["png", "jpg", "jpeg", "heic"]

  /// Ảnh do JS gửi xuống (ảnh đang xem ở feed) — xem KeepAlivePip.setImage.
  /// Ưu tiên hơn file trong bundle; nil thì mới dùng bundle/logo trái tim.
  private static var liveImage: CGImage?
  /// Tăng mỗi lần ảnh đổi, để nội dung PiP biết phải vẽ lại (xem PipCustomImageContent).
  private(set) static var version = 0

  /// Nhận bytes ảnh từ JS (JPEG/PNG/WebP). Trả false nếu decode không ra.
  @discardableResult
  static func setLiveImage(data: Data) -> Bool {
    guard let src = CGImageSourceCreateWithData(data as CFData, nil),
      let img = CGImageSourceCreateImageAtIndex(src, 0, nil)
    else { return false }
    liveImage = img
    version += 1
    return true
  }

  /// Ảnh đã fit đúng khung width×height, sẵn sàng render vào pixel buffer.
  static func makeImage(width: Int, height: Int) -> CGImage? {
    guard width > 0, height > 0 else { return nil }
    let rgb = CGColorSpaceCreateDeviceRGB()
    guard
      let ctx = CGContext(
        data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: rgb,
        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
          | CGBitmapInfo.byteOrder32Little.rawValue)
    else { return nil }

    // Ảnh từ JS trước, rồi mới tới file trong bundle, cuối cùng là logo tự vẽ.
    if let custom = liveImage ?? loadCustomImage() {
      // Aspect-fill: phủ kín ô PiP, phần dư bị cắt (như ảnh bìa).
      let iw = CGFloat(custom.width), ih = CGFloat(custom.height)
      let scale = max(CGFloat(width) / iw, CGFloat(height) / ih)
      let dw = iw * scale, dh = ih * scale
      ctx.draw(
        custom,
        in: CGRect(
          x: (CGFloat(width) - dw) / 2, y: (CGFloat(height) - dh) / 2, width: dw, height: dh))
    } else {
      drawHeartLogo(in: ctx, width: width, height: height)
    }
    return ctx.makeImage()
  }

  private static func loadCustomImage() -> CGImage? {
    for ext in extensions {
      guard let url = Bundle.main.url(forResource: imageName, withExtension: ext),
        let src = CGImageSourceCreateWithURL(url as CFURL, nil),
        let img = CGImageSourceCreateImageAtIndex(src, 0, nil)
      else { continue }
      return img
    }
    return nil
  }

  /// Logo app: gradient hồng → magenta, trái tim trắng ở giữa (như assets/icon.png).
  static func drawHeartLogo(in ctx: CGContext, width: Int, height: Int) {
    let w = CGFloat(width), h = CGFloat(height)
    let rgb = CGColorSpaceCreateDeviceRGB()

    // Nền: gradient dọc, hồng ở trên → magenta ở dưới (y-up nên "trên" là maxY).
    if let top = CGColor(colorSpace: rgb, components: [1.0, 0.36, 0.47, 1]),
      let bottom = CGColor(colorSpace: rgb, components: [0.72, 0.12, 0.62, 1]),
      let gradient = CGGradient(
        colorsSpace: rgb, colors: [top, bottom] as CFArray, locations: [0, 1])
    {
      ctx.drawLinearGradient(
        gradient, start: CGPoint(x: 0, y: h), end: CGPoint(x: 0, y: 0), options: [])
    }

    // Trái tim trắng, chừa lề; hơi lệch lên cho cân mắt.
    let side = min(w, h) * 0.7
    let box = CGRect(x: (w - side) / 2, y: (h - side) / 2 + h * 0.03, width: side, height: side)
    ctx.addPath(heartPath(in: box))
    if let heart = CGColor(colorSpace: rgb, components: [1.0, 0.95, 0.96, 1]) {
      ctx.setFillColor(heart)
      ctx.fillPath()
    }
  }

  /// Trái tim trong hệ toạ độ y-up của CGContext: đỉnh nhọn ở dưới, hai thuỳ ở trên.
  static func heartPath(in rect: CGRect) -> CGPath {
    let p = CGMutablePath()
    let w = rect.width, h = rect.height
    let x = rect.minX, y = rect.minY
    let tip = CGPoint(x: rect.midX, y: y)
    let lobeY = y + h * 0.68
    let lobeR = w * 0.25

    p.move(to: tip)
    p.addCurve(
      to: CGPoint(x: x, y: lobeY),
      control1: CGPoint(x: x + w * 0.16, y: y + h * 0.22),
      control2: CGPoint(x: x, y: y + h * 0.45))
    // clockwise: true → cung đi qua phía trên (π → π/2 → 0) tạo thuỳ trái…
    p.addArc(
      center: CGPoint(x: x + w * 0.25, y: lobeY), radius: lobeR,
      startAngle: .pi, endAngle: 0, clockwise: true)
    // …và kết ở x + 0.5w, đúng điểm bắt đầu của thuỳ phải nên nét liền mạch.
    p.addArc(
      center: CGPoint(x: x + w * 0.75, y: lobeY), radius: lobeR,
      startAngle: .pi, endAngle: 0, clockwise: true)
    p.addCurve(
      to: tip,
      control1: CGPoint(x: x + w, y: y + h * 0.45),
      control2: CGPoint(x: x + w * 0.84, y: y + h * 0.22))
    p.closeSubpath()
    return p
  }
}

// MARK: - Nội dung 5: video phát bình thường, đẩy theo nhịp camera

/// Phát một video trong app bundle ra ô PiP, chạy đúng tốc độ thật và lặp vô hạn.
///
/// Khác PipVideoContent (tự đọc bằng AVAssetReader): class này để AVPlayer lo giải mã
/// + nhịp thời gian, còn khung hình lấy qua AVPlayerItemVideoOutput rồi bơm vào layer
/// theo nhịp khung hình camera — tức đi đúng đường ống đã chạy được của
/// PipCameraContent/PipCustomImageContent (nhịp ~30fps, buffer NV12, PTS host clock).
///
/// Vì AVPlayer chạy theo thời gian thật, video KHÔNG bị nhanh/chậm dù ta lấy frame
/// theo nhịp camera: mỗi lần lấy là hỏi "đúng lúc này video đang ở khung nào".
final class PipVideoPlayerContent: NSObject, PipContent, RTCVideoRenderer {
  private let name: String
  private let ext: String
  private let clockTrack: RTCVideoTrack

  private var player: AVPlayer?
  private var item: AVPlayerItem?
  private var output: AVPlayerItemVideoOutput?
  private var endObserver: NSObjectProtocol?

  private weak var layer: AVSampleBufferDisplayLayer?
  private var formatDesc: CMVideoFormatDescription?
  private var lastW = 0
  private var lastH = 0
  /// Camera thường 30fps, video có thể ít hơn → nhịp nào chưa có khung mới thì bơm
  /// lại khung cũ, để layer không bao giờ hết dữ liệu (hết là PiP "không khả thi").
  private var lastBuffer: CVPixelBuffer?

  init(name: String, ext: String, clockTrack: RTCVideoTrack) {
    self.name = name
    self.ext = ext
    self.clockTrack = clockTrack
    super.init()
  }

  func start(on layer: AVSampleBufferDisplayLayer) -> Bool {
    guard let url = Bundle.main.url(forResource: name, withExtension: ext) else {
      NSLog("[PipVideoPlayerContent] không thấy %@.%@ trong bundle → dùng nội dung khác", name, ext)
      return false
    }

    // Xin sẵn khung hình ở NV12 full-range — đúng định dạng camera vẫn đang hiển thị
    // được, nên không phải convert gì thêm.
    let out = AVPlayerItemVideoOutput(pixelBufferAttributes: [
      kCVPixelBufferPixelFormatTypeKey as String: Int(
        kCVPixelFormatType_420YpCbCr8BiPlanarFullRange),
      kCVPixelBufferIOSurfacePropertiesKey as String: [:] as CFDictionary,
    ])

    let item = AVPlayerItem(url: url)
    item.add(out)

    let player = AVPlayer(playerItem: item)
    player.isMuted = true  // không đụng vào audio cuộc gọi WebRTC
    player.actionAtItemEnd = .none
    // Không có dòng này, iOS dừng giải mã video khi app xuống nền — đúng lúc cần PiP
    // nhất thì hình đứng lại.
    if #available(iOS 15.0, *) {
      player.audiovisualBackgroundPlaybackPolicy = .continuesIfPossible
    }

    // Lặp: về đầu mỗi khi hết, giữ nguyên item nên video output không phải gắn lại.
    endObserver = NotificationCenter.default.addObserver(
      forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
    ) { [weak player] _ in
      player?.seek(to: .zero)
      player?.play()
    }

    player.play()

    self.item = item
    self.output = out
    self.player = player
    self.layer = layer
    clockTrack.add(self)
    return true
  }

  func stop() {
    clockTrack.remove(self)
    if let observer = endObserver { NotificationCenter.default.removeObserver(observer) }
    endObserver = nil
    player?.pause()
    player = nil
    if let item = item, let out = output { item.remove(out) }
    item = nil
    output = nil
    layer = nil
    formatDesc = nil
    lastBuffer = nil
  }

  // MARK: RTCVideoRenderer

  func setSize(_ size: CGSize) {}

  func renderFrame(_ frame: RTCVideoFrame?) {
    guard let layer = layer, let out = output else { return }

    // "Đúng thời điểm này thì video đang ở khung nào" → tốc độ phát luôn là thật.
    let itemTime = out.itemTime(forHostTime: CACurrentMediaTime())
    if out.hasNewPixelBuffer(forItemTime: itemTime),
      let fresh = out.copyPixelBuffer(forItemTime: itemTime, itemTimeForDisplay: nil)
    {
      lastBuffer = fresh
    }
    guard let pb = lastBuffer else { return }

    let w = CVPixelBufferGetWidth(pb)
    let h = CVPixelBufferGetHeight(pb)
    if formatDesc == nil || w != lastW || h != lastH {
      var fd: CMVideoFormatDescription?
      CMVideoFormatDescriptionCreateForImageBuffer(
        allocator: kCFAllocatorDefault, imageBuffer: pb, formatDescriptionOut: &fd)
      guard let desc = fd else { return }
      formatDesc = desc
      lastW = w
      lastH = h
      NSLog("[PipVideoPlayerContent] khung hình video %dx%d", w, h)
    }
    guard let fd = formatDesc else { return }

    var timing = CMSampleTimingInfo(
      duration: .invalid,
      presentationTimeStamp: CMClockGetTime(CMClockGetHostTimeClock()),
      decodeTimeStamp: .invalid)
    var sample: CMSampleBuffer?
    CMSampleBufferCreateForImageBuffer(
      allocator: kCFAllocatorDefault, imageBuffer: pb, dataReady: true,
      makeDataReadyCallback: nil, refcon: nil, formatDescription: fd,
      sampleTiming: &timing, sampleBufferOut: &sample)
    guard let s = sample else { return }

    if let atts = CMSampleBufferGetSampleAttachmentsArray(s, createIfNecessary: true),
      CFArrayGetCount(atts) > 0
    {
      let d = unsafeBitCast(CFArrayGetValueAtIndex(atts, 0), to: CFMutableDictionary.self)
      CFDictionarySetValue(
        d, Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(),
        Unmanaged.passUnretained(kCFBooleanTrue).toOpaque())
    }

    DispatchQueue.main.async {
      if #available(iOS 17.0, *) {
        if layer.sampleBufferRenderer.isReadyForMoreMediaData {
          layer.sampleBufferRenderer.enqueue(s)
        }
      } else if layer.isReadyForMoreMediaData {
        layer.enqueue(s)
      }
    }
  }
}
