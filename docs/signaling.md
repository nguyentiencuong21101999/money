# Hợp đồng signaling cho gọi video một chiều

Tài liệu này mô tả **giao thức** mà hai bên phải nói giống hệt nhau:

| Bên | Vai | Chạy ở đâu |
|---|---|---|
| **Chia sẻ** (sharer) | Bật camera của mình, tạo **offer** | Web ([`shareCamera()`](../src/lib/call.ts)) và app React Native trong [`mobile/`](../mobile) |
| **Xem** (viewer) | Nhận stream, tạo **answer** | Chỉ web ([`viewRoom()`](../src/lib/call.ts)) |

Bên xem **không có bản native** và sẽ không có: nó chỉ nhận stream nên không dính giới hạn camera nền của iOS. Vì vậy **mọi thay đổi ở đây phải giữ bên xem web chạy được**.

> **Nguồn sự thật là code, không phải file này.** [`src/lib/call.ts`](../src/lib/call.ts) là bản cài đặt chuẩn. Sửa giao thức thì sửa cả hai nơi và cập nhật tài liệu này trong cùng một commit — bên xem web đứng hình mà không rõ lý do gần như luôn là do hai bên lệch nhau.

---

## Room

Id room **cố định theo cặp email**, không cần máy chủ cấp phát:

```
roomId = [emailA, emailB].map(lowercase).map(trim).sort().join("__")
```

Sắp xếp là bắt buộc — thiếu nó hai bên tự tính ra hai id khác nhau và không bao giờ gặp nhau.

Document: `calls/{roomId}`

Phân quyền nằm ở [`firestore.rules`](../firestore.rules): chỉ tài khoản có **email đã xác minh** nằm trong mảng `emails` của document mới đọc/ghi được. Người ngoài biết id room cũng không vào được. Không cần Admin SDK.

---

## Các field trên `calls/{roomId}`

| Field | Ai ghi | Ý nghĩa |
|---|---|---|
| `emails` | cả hai | Mảng đúng 2 email viết thường. Rule đọc field này để phân quyền |
| `sharerEmail` | chia sẻ | Ai đang chia sẻ |
| `status` | chia sẻ | `"sharing"` \| `"ended"` |
| `offer` | chia sẻ | `{ type, sdp, offerId }` |
| `answer` | xem | `{ type, sdp, offerId }` |
| `wantOffer` | xem | Dấu thời gian; **đổi giá trị** = xin offer mới |
| `wantFacing` | xem | `{ at, facing: "user" \| "environment" }` |
| `wantQuality` | xem | `{ at, quality: "480p" \| "720p" \| "1080p" }` |

Subcollection:

| Đường dẫn | Ai ghi | Nội dung |
|---|---|---|
| `sharerCandidates/{auto}` | chia sẻ | ICE candidate + `offerId` |
| `requesterCandidates/{auto}` | xem | ICE candidate + `offerId` |
| `presence/{email}` | cả hai | `{ email, lastSeen }` |

---

## Vòng đời một phiên

### 1. Bên chia sẻ vào room

```
setDoc(calls/{roomId}, { emails, sharerEmail, status: "sharing" }, { merge: true })
```

**Bắt buộc `merge: true`.** Ghi đè sẽ xoá mất `wantOffer` mà bên xem vừa đặt, và bên xem sẽ chờ mãi một offer không bao giờ tới.

Lúc này **chưa bật camera**. Xem mục [Camera bật khi nào](#camera-bật-khi-nào).

### 2. Bên xem vào room và xin offer

```
setDoc(calls/{roomId}, { emails }, { merge: true })   // bảo đảm doc tồn tại để rule đọc được resource.data
updateDoc(calls/{roomId}, { wantOffer: Date.now() })
```

Xin offer mới **mỗi lần vào**, nhờ vậy vào/vào lại đều nối được, không phải dùng lại một offer cũ đã chết.

### 3. Bên chia sẻ tạo offer

Khi thấy `wantOffer` **đổi giá trị** so với lần trước:

1. Đóng peer connection cũ, huỷ listener ICE cũ.
2. **Xoá sạch subcollection `sharerCandidates`.** Bỏ qua bước này thì candidate của vòng trước lẫn vào vòng mới.
3. Sinh `offerId` mới (UUID).
4. Tạo `RTCPeerConnection` với [ICE servers](#ice-servers), `addTrack` mọi track của stream.
5. `createOffer()` → `setLocalDescription()`.
6. Ghi:
   ```
   updateDoc(calls/{roomId}, {
     offer: { type, sdp, offerId },
     answer: null,
   })
   ```
   Đặt `answer: null` để không nhặt nhầm answer của vòng trước.
7. Lắng nghe `requesterCandidates`, **chỉ nhận doc có `offerId` khớp vòng hiện tại**.

### 4. Bên xem trả lời

Khi thấy `offer.offerId` khác cái đã xử lý:

1. Đóng peer cũ, xoá sạch `requesterCandidates`.
2. Tạo peer mới, `setRemoteDescription(offer)`.
3. `createAnswer()` → `setLocalDescription()` → ghi `answer: { type, sdp, offerId }`.
4. Lắng nghe `sharerCandidates` lọc theo cùng `offerId`.

Dùng thẳng stream trình duyệt cấp trong `ontrack` (`e.streams[0]`) — Safari vẽ được track thêm sau, còn `MediaStream` tự dựng hay bị đen hình.

### 5. Trao đổi ICE

Mỗi candidate ghi thành **một document** trong subcollection của phía mình, kèm field `offerId`.

Bên nhận chỉ nạp candidate khi `offerId` khớp **và** `signalingState !== "closed"`.

`RTCIceCandidate.toJSON()` có thể chứa key giá trị `undefined` — Firestore từ chối `undefined`, phải lọc bỏ trước khi ghi.

### 6. Kết thúc

Bên chia sẻ:
```
updateDoc(calls/{roomId}, { offer: null, status: "ended" })
deleteDoc(calls/{roomId}/presence/{email})
```

**Không xoá cả document** — room cố định theo cặp email nên còn dùng lại.

Bên xem thấy `offer` biến mất thì đóng peer, xoá hình, quay về trạng thái chờ.

---

## Presence

Mỗi người trong room ghi một "nhịp tim":

```
calls/{roomId}/presence/{email}  =  { email, lastSeen }
```

| | Giá trị |
|---|---|
| Nhịp lại mỗi | **5000 ms** |
| Coi là đã ra sau | **15000 ms** không nhịp |

> **`lastSeen` là số mili-giây epoch**, tức `Date.now()` của JavaScript — **không phải Firestore `Timestamp`**. App native phải ghi `Date().timeIntervalSince1970 * 1000`. Ghi sai kiểu thì bên web đếm ra 0 người và camera không bao giờ bật.

Cách này chịu được việc đóng tab đột ngột: nhịp thôi cập nhật là tự bị coi như đã ra.

### Camera bật khi nào

Bên chia sẻ **chỉ bật camera thật khi số người còn tươi trong room ≥ 2**. Còn một mình thì tắt camera nhưng **vẫn ở trong room** chờ người vào lại.

Đây là quyết định có chủ đích, không phải tối ưu vặt: không bao giờ có luồng camera chạy mà không ai xem.

---

## Yêu cầu từ bên xem

Bên xem không điều khiển camera trực tiếp — nó **đặt yêu cầu**, bên chia sẻ tự áp dụng.

```
wantFacing:  { at: Date.now(), facing: "user" | "environment" }
wantQuality: { at: Date.now(), quality: "480p" | "720p" | "1080p" }
```

Bên chia sẻ chỉ nhận yêu cầu **còn tươi**: `Date.now() - at < 40000`. Và phải nhớ `at` đã xử lý lần trước để không áp lại cùng một yêu cầu mỗi lần snapshot bắn.

Độ phân giải:

| Mức | Kích thước |
|---|---|
| `480p` | 640 × 480 |
| `720p` | 1280 × 720 |
| `1080p` | 1920 × 1080 |

Đổi bằng cách **lấy hẳn stream mới** rồi `sender.replaceTrack()` — không đàm phán lại.

> **Phải `stop()` track cũ TRƯỚC khi gọi `getUserMedia`.** iOS không cho mở hai luồng camera cùng lúc, và `applyConstraints` để đổi độ phân giải trên iOS gần như vô hiệu.

---

## ICE servers

```js
{ iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] }
```

**Chỉ có STUN, chưa có TURN.** Đủ cho hai máy cùng Wi-Fi hoặc mạng thoáng. Mạng chặt (4G, NAT đối xứng, Wi-Fi công ty) sẽ **không nối được** — `connectionState` về `"failed"`.

Đây là giới hạn đã biết, và app native **không** sửa được. Muốn chạy ngoài Wi-Fi nhà thì phải dựng TURN (coturn tự host hoặc dịch vụ trả tiền) và thêm vào đúng một chỗ này cho cả hai bên.

---

## Bẫy đã gặp

Ghi lại để không ai vấp lại:

1. **Không `merge: true`** khi bên chia sẻ vào room → xoá mất `wantOffer`, bên xem chờ vô hạn.
2. **Ghi `lastSeen` kiểu `Timestamp`** thay vì số → bên web đếm 0 người → camera không bao giờ bật.
3. **Không lọc `offerId`** khi nạp ICE → candidate vòng cũ làm hỏng vòng mới.
4. **Không xoá `sharerCandidates` trước mỗi offer** → tồn đọng candidate chết.
5. **Ghi `undefined` vào Firestore** (từ `candidate.toJSON()`) → cả lượt ghi bị từ chối.
6. **Không `stop()` track cũ trước `getUserMedia`** trên iOS → stream mới không lấy được.
7. **Nuốt lỗi Firestore** → bên xem đen màn hình mà không rõ vì sao. Luôn `console.error`, đừng `.catch(() => {})` im lặng ở đường signaling chính.
