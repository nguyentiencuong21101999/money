#import <React/RCTBridgeModule.h>

// Đăng ký lớp Swift KeepAlivePip với React Native (kiến trúc cũ).
@interface RCT_EXTERN_MODULE (KeepAlivePip, NSObject)

// trackId = id của video track camera đang chia sẻ (để đẩy vào ô PiP). Rỗng = không có.
RCT_EXTERN_METHOD(start:(NSString *)trackId)
RCT_EXTERN_METHOD(stop)

// base64 = bytes ảnh đang xem ở feed (JS tải vì cần idToken Firebase).
RCT_EXTERN_METHOD(setImage:(NSString *)base64)

// Zoom camera đang quay theo deviceId (uniqueID) + hệ số (1 = không zoom).
RCT_EXTERN_METHOD(setCameraZoom:(NSString *)deviceId factor:(nonnull NSNumber *)factor)

@end
