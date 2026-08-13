"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  type DocumentReference,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./firebase";

/**
 * Gọi video MỘT CHIỀU, minh bạch: một người chia sẻ camera của CHÍNH mình,
 * người kia xem. Bên chia sẻ luôn tự bấm đồng ý và luôn thấy dấu "đang chia sẻ"
 * (khung nổi ở CallProvider) — không có kiểu bật lén.
 *
 * Room CỐ ĐỊNH theo cặp email: id = hai email sắp xếp, nối bằng "__". Ai mở link
 * cũng ra đúng một room, không cần máy chủ tạo/tra gì. Firestore phân quyền theo
 * email trong `emails` của document (xem firestore.rules) nên cả hai bên đọc/
 * ghi được mà không cần Admin SDK.
 *
 * Vai kỹ thuật: bên chia sẻ (có camera) tạo OFFER + sharerCandidates; bên xem
 * tạo ANSWER + requesterCandidates. Chỉ STUN công cộng — đủ cho cùng Wi-Fi/mạng
 * thường; mạng chặt (4G) có thể cần TURN, chưa có.
 */
const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ],
};

/** Id room cố định cho một cặp email (sắp xếp để hai bên ra cùng một id). */
export function roomId(a: string, b: string): string {
  return [a.toLowerCase().trim(), b.toLowerCase().trim()].sort().join("__");
}

/** Mức chất lượng camera bên chia sẻ chọn. Cao = nét nhưng tốn băng thông (dễ
 *  giật qua 4G); "ideal" nên máy/mạng không kham nổi thì tự hạ. */
export type Quality = "480p" | "720p" | "1080p";
export const QUALITY: Record<Quality, { width: number; height: number }> = {
  "480p": { width: 640, height: 480 },
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
};

// Presence: mỗi người trong room ghi một "nhịp tim" định kỳ. Ai đóng tab đột
// ngột thì nhịp thôi cập nhật và bị coi là đã ra sau STALE_MS.
const HEARTBEAT_MS = 5000;
const STALE_MS = 15000;

export interface Presence {
  stop: () => void;
}

/** Đánh dấu mình đang ở trong room + đập nhịp định kỳ. Gọi SAU khi doc room đã
 *  tồn tại (share/view đã tạo), vì rule presence dùng get() lên doc cha. */
export function enterRoom(callId: string, myEmail: string): Presence {
  const ref = doc(getDb(), "calls", callId, "presence", myEmail.toLowerCase());
  const beat = () =>
    void setDoc(ref, { email: myEmail.toLowerCase(), lastSeen: Date.now() }).catch(
      () => {},
    );
  beat();
  const id = setInterval(beat, HEARTBEAT_MS);
  return {
    stop: () => {
      clearInterval(id);
      void deleteDoc(ref).catch(() => {});
    },
  };
}

/** Nghe số người đang trong room (nhịp còn tươi). */
export function watchRoomCount(
  callId: string,
  onCount: (n: number) => void,
): Unsubscribe {
  const presence = collection(doc(getDb(), "calls", callId), "presence");
  return onSnapshot(presence, (snap) => {
    const now = Date.now();
    const n = snap.docs.filter(
      (d) => now - (Number(d.data().lastSeen) || 0) < STALE_MS,
    ).length;
    onCount(n);
  });
}

/** Người xem yêu cầu bên chia sẻ đổi cam trước ("user") / sau ("environment"). */
export async function requestFacing(
  callId: string,
  facing: "user" | "environment",
): Promise<void> {
  await updateDoc(doc(getDb(), "calls", callId), {
    wantFacing: { at: Date.now(), facing },
  }).catch(() => {});
}

/** Người xem yêu cầu bên chia sẻ đổi chất lượng. */
export async function requestQuality(
  callId: string,
  quality: Quality,
): Promise<void> {
  await updateDoc(doc(getDb(), "calls", callId), {
    wantQuality: { at: Date.now(), quality },
  }).catch(() => {});
}

/**
 * Người xem bật/tắt MIC của bên chia sẻ.
 *
 * Mic bên chia sẻ mặc định TẮT (không thu âm, không active) — chỉ khi người xem
 * gọi hàm này với on=true thì bên chia sẻ mới mở mic và đàm phán lại để đẩy tiếng
 * sang. on=false thì gỡ hẳn track mic (không phải chỉ mute), nên bên chia sẻ
 * không còn active mic.
 */
export async function requestAudio(callId: string, on: boolean): Promise<void> {
  await updateDoc(doc(getDb(), "calls", callId), {
    wantAudio: { at: Date.now(), on },
  }).catch(() => {});
}

/**
 * Chọn ĐÚNG camera theo mặt, trả deviceId.
 *
 * Vì sao không tin `facingMode`: react-native-webrtc liệt kê MỌI ống kính sau
 * (wide/ultrawide/tele/dual/triple) đều mang facing "environment", và khi chỉ
 * đưa facingMode, lib lấy "cái đầu tiên khớp mặt" — thứ tự này KHÁC nhau giữa
 * các đời iPhone, nên iPhone 15 và 16 vớ phải ống kính khác nhau. Chọn thẳng
 * deviceId thì hai máy giống nhau.
 *
 * Trên web `facing` không có (trình duyệt không trả) → hàm trả undefined, nơi gọi
 * tự quay về dùng facingMode như cũ. Nên web KHÔNG đổi hành vi.
 */
/** Một camera người xem có thể chọn. `zoom` là nhãn ngắn để vẽ nút (0.5x/1x/Tele/Trước). */
export interface CameraInfo {
  deviceId: string;
  label: string;
  zoom: string;
  facing: "user" | "environment";
}

/**
 * Liệt kê camera VẬT LÝ để người xem chọn ống kính (= zoom quang thật). Bỏ các
 * "camera ảo" gộp nhiều ống kính (Dual/Triple) cho danh sách gọn: chỉ còn cam
 * trước + tối đa 3 ống kính sau (siêu rộng / rộng / tele).
 */
export async function listCameras(): Promise<CameraInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const out: CameraInfo[] = [];
    for (const d of devices) {
      if (d.kind !== "videoinput") continue;
      const label = d.label || "";
      if (/dual|triple/i.test(label)) continue; // camera ảo gộp ống kính
      const facing: "user" | "environment" =
        (d as { facing?: string }).facing === "front" || /front/i.test(label)
          ? "user"
          : "environment";
      let zoom: string;
      if (facing === "user") zoom = "Trước";
      else if (/ultra/i.test(label)) zoom = "0.5x";
      else if (/tele/i.test(label)) zoom = "Tele";
      else zoom = "1x";
      out.push({ deviceId: d.deviceId, label, zoom, facing });
    }
    return out;
  } catch {
    return [];
  }
}

/** Người xem chọn thẳng một camera (theo deviceId đã công bố ở call doc). */
export async function requestCamera(callId: string, deviceId: string): Promise<void> {
  await updateDoc(doc(getDb(), "calls", callId), {
    wantCamera: { at: Date.now(), deviceId },
  }).catch(() => {});
}

export async function pickCameraId(
  facing: "user" | "environment",
): Promise<string | undefined> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    const want = facing === "user" ? "front" : "environment";
    const byFacing = cams.filter(
      (d) => (d as { facing?: string }).facing === want,
    );
    if (!byFacing.length) return undefined; // web / không có thông tin mặt
    if (facing === "user") return byFacing[0].deviceId;
    // Mặt sau nhiều ống kính → lấy "Back Camera" (wide chính), tránh ultrawide/tele.
    const main = byFacing.find((d) => /back camera$/i.test(d.label));
    return (main ?? byFacing[0]).deviceId;
  } catch {
    return undefined;
  }
}

/** Hai email tạo nên room, suy ngược từ id. */
function emailsOf(callId: string): string[] {
  return callId.split("__");
}

/** Id ngẫu nhiên cho mỗi vòng offer. crypto.randomUUID chỉ có từ Safari 15.4,
 *  nên có nhánh dự phòng cho iPhone đời cũ. */
function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function candidateData(candidate: RTCIceCandidate): Record<string, unknown> {
  const json = candidate.toJSON() as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(json)) if (v !== undefined) clean[k] = v;
  return clean;
}

async function clearCandidates(
  callRef: DocumentReference,
  name: string,
): Promise<void> {
  const snap = await getDocs(collection(callRef, name));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

export interface ShareSession {
  viewerEmail: string;
  stop: () => void;
}

/**
 * Bên chia sẻ: bật camera của mình vào room. Tạo offer MỚI mỗi khi bên xem xin
 * (`wantOffer` đổi) — nhờ vậy bên xem vào/vào lại đều nối được, không phải một
 * offer dùng mãi. Mỗi offer có `offerId` riêng để answer/candidate khớp đúng
 * phiên.
 */
export async function shareCamera(params: {
  callId: string;
  myEmail: string;
  stream: MediaStream;
  quality?: Quality;
  onState: (state: RTCPeerConnectionState) => void;
}): Promise<ShareSession> {
  const db = getDb();
  const callRef = doc(db, "calls", params.callId);
  const emails = emailsOf(params.callId);
  const me = params.myEmail.toLowerCase();
  const viewerEmail = emails.find((e) => e !== me) ?? "người xem";
  // Mặt cam + chất lượng hiện tại, để đổi cam/đổi chất lượng lấy lại đúng stream.
  let curFacing: "user" | "environment" = "user";
  let curQuality: Quality = params.quality ?? "720p";
  // Camera người xem chọn thẳng (đè lên curFacing). undefined = theo mặt cam.
  let curDeviceId: string | undefined;

  // Ghi emails + đánh dấu đang chia sẻ (merge, không xoá wantOffer bên xem đã đặt).
  await setDoc(callRef, { emails, sharerEmail: me, status: "sharing" }, { merge: true });

  // Công bố danh sách camera để người xem chọn ống kính (zoom quang). Không chặn
  // luồng chính; lỗi thì thôi, người xem vẫn có nút đổi trước/sau mặc định.
  void listCameras().then((cams) => {
    if (cams.length) void updateDoc(callRef, { cameras: cams }).catch(() => {});
  });

  let pc: RTCPeerConnection | null = null;
  let offerId = "";
  let candUnsub: Unsubscribe | null = null;

  async function makeOffer() {
    try {
      pc?.close();
      candUnsub?.();
      await clearCandidates(callRef, "sharerCandidates").catch(() => {});
      const id = newId();
      offerId = id;
      pc = new RTCPeerConnection(ICE_CONFIG);
      pc.onconnectionstatechange = () => params.onState(pc!.connectionState);
      // Trước khi bốc track vào offer, chỉnh stream cho khớp yêu cầu mic hiện tại
      // (thêm track mic nếu người xem đang bật, gỡ nếu tắt).
      await ensureAudioTrack();
      params.stream.getTracks().forEach((t) => pc!.addTrack(t, params.stream));
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          void addDoc(collection(callRef, "sharerCandidates"), {
            ...candidateData(e.candidate),
            offerId: id,
          }).catch(() => {});
        }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await updateDoc(callRef, {
        offer: { type: offer.type, sdp: offer.sdp, offerId: id },
        answer: null,
      });

      // Nhận ICE của bên xem cho đúng offer này.
      candUnsub = onSnapshot(
        collection(callRef, "requesterCandidates"),
        (s) => {
          s.docChanges().forEach((c) => {
            if (c.type !== "added") return;
            const d = c.doc.data();
            if (d.offerId === offerId && pc && pc.signalingState !== "closed") {
              void pc.addIceCandidate(new RTCIceCandidate(d)).catch(() => {});
            }
          });
        },
        (err) => console.error("[call] nghe ICE người xem lỗi", err),
      );
    } catch (err) {
      console.error("[call] tạo offer thất bại", err);
    }
  }

  // Lấy lại video theo mặt cam + chất lượng hiện tại, rồi thay track trên
  // sender (không đàm phán lại). TẮT track cũ TRƯỚC khi getUserMedia: iOS không
  // cho mở hai luồng camera cùng lúc; và đổi độ phân giải bằng applyConstraints
  // trên iOS gần như vô hiệu, nên phải lấy hẳn stream mới.
  let reacquiring = false;
  async function reacquireVideo() {
    if (reacquiring) return;
    reacquiring = true;
    try {
      const q = QUALITY[curQuality];
      const old = params.stream.getVideoTracks()[0];
      if (old) {
        params.stream.removeTrack(old);
        old.stop();
      }
      // Ưu tiên camera người xem chọn thẳng; không thì chọn theo mặt cam.
      const camId = curDeviceId ?? (await pickCameraId(curFacing));
      const ns = await navigator.mediaDevices.getUserMedia({
        video: {
          // deviceId chọn đúng ống kính (xem pickCameraId); web không có deviceId
          // thì quay về facingMode.
          ...(camId ? { deviceId: camId } : { facingMode: curFacing }),
          width: { ideal: q.width },
          height: { ideal: q.height },
        },
        audio: false,
      });
      const nt = ns.getVideoTracks()[0];
      if (!nt) return;
      params.stream.addTrack(nt);
      const sender = pc?.getSenders().find((s) => s.track?.kind === "video");
      await sender?.replaceTrack(nt);
    } catch (err) {
      console.error("[call] lấy lại camera lỗi", err);
    } finally {
      reacquiring = false;
    }
  }

  // Mic: mặc định TẮT. Người xem bật/tắt qua wantAudio; ensureAudioTrack() làm
  // cho stream khớp curAudio (thêm/gỡ hẳn track mic, không phải chỉ mute).
  let curAudio = false;
  async function ensureAudioTrack() {
    const has = params.stream.getAudioTracks().length > 0;
    if (curAudio && !has) {
      try {
        const as = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const at = as.getAudioTracks()[0];
        if (at) params.stream.addTrack(at);
      } catch (err) {
        console.error("[call] mở mic lỗi", err);
      }
    } else if (!curAudio && has) {
      const at = params.stream.getAudioTracks()[0];
      if (at) {
        params.stream.removeTrack(at);
        at.stop();
      }
    }
  }

  let lastFacingAt = 0;
  let lastQualityAt = 0;
  let lastAudioAt = 0;
  let lastCameraAt = 0;

  let lastWant: unknown = null;
  const unsubDoc = onSnapshot(
    callRef,
    (s) => {
      const d = s.data();
      if (!d) return;
      // Người xem yêu cầu đổi cam trước/sau (chỉ nhận yêu cầu còn tươi).
      const wf = d.wantFacing;
      if (
        wf &&
        typeof wf.at === "number" &&
        wf.at > lastFacingAt &&
        Date.now() - wf.at < 40000
      ) {
        lastFacingAt = wf.at;
        curFacing = wf.facing === "environment" ? "environment" : "user";
        curDeviceId = undefined; // đổi mặt cam thì bỏ lựa chọn ống kính cũ
        void reacquireVideo();
      }
      // Người xem chọn thẳng một ống kính (siêu rộng / rộng / tele / trước).
      const wc = d.wantCamera;
      if (wc && typeof wc.at === "number" && wc.at > lastCameraAt && wc.deviceId) {
        lastCameraAt = wc.at;
        curDeviceId = wc.deviceId as string;
        void reacquireVideo();
      }
      // Người xem yêu cầu đổi chất lượng (còn tươi).
      const wq = d.wantQuality;
      if (
        wq &&
        typeof wq.at === "number" &&
        wq.at > lastQualityAt &&
        Date.now() - wq.at < 40000 &&
        QUALITY[wq.quality as Quality]
      ) {
        lastQualityAt = wq.at;
        curQuality = wq.quality as Quality;
        void reacquireVideo();
      }
      // Người xem bật/tắt mic của bên chia sẻ. Đổi thì đàm phán lại để thêm/gỡ
      // track mic (makeOffer gọi ensureAudioTrack trước khi tạo offer).
      const wa = d.wantAudio;
      if (wa && typeof wa.at === "number" && wa.at > lastAudioAt) {
        lastAudioAt = wa.at;
        const on = !!wa.on;
        if (on !== curAudio) {
          curAudio = on;
          void makeOffer();
        }
      }
      // Bên xem xin offer (vào / vào lại) → tạo offer mới.
      if (d.wantOffer && d.wantOffer !== lastWant) {
        lastWant = d.wantOffer;
        void makeOffer();
        return;
      }
      // Answer cho offer hiện tại. Chỉ nhận khi đang CHỜ answer
      // (signalingState === "have-local-offer"): đã tạo offer, đặt localDescription,
      // chưa có remote. Áp xong thì state chuyển "stable" nên snapshot lặp lại sẽ
      // bị bỏ qua.
      //
      // TRƯỚC đây guard bằng `!pc.currentRemoteDescription`, chạy đúng trên web
      // nhưng react-native-webrtc trả `currentRemoteDescription` = null kể cả sau
      // khi đã set → guard luôn đúng → áp lại answer mỗi lần snapshot bắn → lỗi
      // "Called in wrong state: stable" lặp vô hạn. Dùng signalingState đúng cho
      // cả hai nền tảng.
      const ans = d.answer;
      if (
        ans &&
        ans.offerId === offerId &&
        pc &&
        pc.signalingState === "have-local-offer"
      ) {
        void pc
          .setRemoteDescription(
            new RTCSessionDescription({ type: ans.type, sdp: ans.sdp }),
          )
          .catch((err) => console.error("[call] nhận answer lỗi", err));
      }
    },
    (err) => console.error("[call] nghe room (chia sẻ) lỗi", err),
  );

  return {
    viewerEmail,
    stop: () => {
      unsubDoc();
      candUnsub?.();
      pc?.close();
      // Xoá offer để bên xem biết mình đã rời (không xoá cả doc — room cố định
      // còn dùng lại).
      void updateDoc(callRef, { offer: null, status: "ended" }).catch(() => {});
    },
  };
}

export interface ViewSession {
  sharerEmail: string;
  stop: () => void;
}

/**
 * Bên xem: vào room, XIN bên chia sẻ tạo offer mới (đặt `wantOffer`), rồi trả
 * lời. Nhờ xin offer mới mỗi lần vào nên vào/vào lại đều nối được. Khi bên chia
 * sẻ share lại (offer mới, offerId mới), listener này tự trả lời lại — bên xem
 * tự hiện hình, không phải bấm gì.
 */
export async function viewRoom(params: {
  callId: string;
  myEmail: string;
  onState: (state: RTCPeerConnectionState | null) => void;
  onRemoteStream: (stream: MediaStream | null) => void;
  /** Danh sách camera bên chia sẻ công bố, để người xem chọn ống kính. */
  onCameras?: (cams: CameraInfo[]) => void;
}): Promise<ViewSession> {
  const db = getDb();
  const callRef = doc(db, "calls", params.callId);
  const emails = emailsOf(params.callId);
  const me = params.myEmail.toLowerCase();
  const sharerEmail = emails.find((e) => e !== me) ?? "người chia sẻ";

  // Bảo đảm doc tồn tại (rule đọc cần resource.data), rồi xin offer mới.
  await setDoc(callRef, { emails }, { merge: true });
  await updateDoc(callRef, { wantOffer: Date.now() }).catch((err) =>
    console.error("[call] xin offer lỗi", err),
  );

  let pc: RTCPeerConnection | null = null;
  let handledOffer = "";
  let unsubCands: Unsubscribe | null = null;
  let lastCamerasJson = "";

  const unsubDoc = onSnapshot(
    callRef,
    (s) => {
      // Danh sách camera bên chia sẻ công bố (để người xem chọn ống kính).
      const cams = s.data()?.cameras;
      if (params.onCameras && Array.isArray(cams)) {
        const json = JSON.stringify(cams);
        if (json !== lastCamerasJson) {
          lastCamerasJson = json;
          params.onCameras(cams as CameraInfo[]);
        }
      }
      const offer = s.data()?.offer;
      // Bên chia sẻ đã dừng (offer bị xoá) → xoá hình, quay về trạng thái chờ
      // thay vì đứng khung cũ.
      if (!offer?.offerId) {
        if (handledOffer) {
          handledOffer = "";
          unsubCands?.();
          unsubCands = null;
          pc?.close();
          pc = null;
          params.onRemoteStream(null);
          params.onState(null);
        }
        return;
      }
      if (offer.offerId === handledOffer) return;
      handledOffer = offer.offerId;
      const oid = offer.offerId;
      void (async () => {
        try {
          pc?.close();
          unsubCands?.();
          await clearCandidates(callRef, "requesterCandidates").catch(() => {});
          pc = new RTCPeerConnection(ICE_CONFIG);
          pc.onconnectionstatechange = () => params.onState(pc!.connectionState);
          pc.ontrack = (e) => {
            // Dùng thẳng stream do trình duyệt tạo cho kết nối này: Safari vẽ
            // được track thêm sau, còn MediaStream tự dựng thì hay đen hình.
            if (e.streams[0]) params.onRemoteStream(e.streams[0]);
          };
          pc.onicecandidate = (e) => {
            if (e.candidate) {
              void addDoc(collection(callRef, "requesterCandidates"), {
                ...candidateData(e.candidate),
                offerId: oid,
              }).catch((err) => console.error("[call] ghi ICE người xem lỗi", err));
            }
          };
          await pc.setRemoteDescription(
            new RTCSessionDescription({ type: offer.type, sdp: offer.sdp }),
          );
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await updateDoc(callRef, {
            answer: { type: answer.type, sdp: answer.sdp, offerId: oid },
          });

          unsubCands = onSnapshot(
            collection(callRef, "sharerCandidates"),
            (cs) => {
              cs.docChanges().forEach((c) => {
                if (c.type !== "added") return;
                const d = c.doc.data();
                if (d.offerId === oid && pc && pc.signalingState !== "closed") {
                  void pc
                    .addIceCandidate(new RTCIceCandidate(d))
                    .catch((err) => console.error("[call] nhận ICE lỗi", err));
                }
              });
            },
            (err) => console.error("[call] nghe ICE lỗi", err),
          );
        } catch (err) {
          // Hay gặp: Firestore từ chối (rules chưa Publish) — trước đây bị nuốt
          // nên bên xem cứ đen màn hình mà không rõ vì sao.
          console.error("[call] người xem trả lời offer thất bại", err);
        }
      })();
    },
    (err) => console.error("[call] nghe room (xem) lỗi", err),
  );

  return {
    sharerEmail,
    stop: () => {
      unsubDoc();
      unsubCands?.();
      pc?.close();
    },
  };
}
