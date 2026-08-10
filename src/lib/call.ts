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
  onState: (state: RTCPeerConnectionState) => void;
}): Promise<ShareSession> {
  const db = getDb();
  const callRef = doc(db, "calls", params.callId);
  const emails = emailsOf(params.callId);
  const me = params.myEmail.toLowerCase();
  const viewerEmail = emails.find((e) => e !== me) ?? "người xem";

  // Ghi emails + đánh dấu đang chia sẻ (merge, không xoá wantOffer bên xem đã đặt).
  await setDoc(callRef, { emails, sharerEmail: me, status: "sharing" }, { merge: true });

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

  let lastWant: unknown = null;
  const unsubDoc = onSnapshot(
    callRef,
    (s) => {
      const d = s.data();
      if (!d) return;
      // Bên xem xin offer (vào / vào lại) → tạo offer mới.
      if (d.wantOffer && d.wantOffer !== lastWant) {
        lastWant = d.wantOffer;
        void makeOffer();
        return;
      }
      // Answer cho offer hiện tại.
      const ans = d.answer;
      if (ans && ans.offerId === offerId && pc && !pc.currentRemoteDescription) {
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

  const unsubDoc = onSnapshot(
    callRef,
    (s) => {
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
