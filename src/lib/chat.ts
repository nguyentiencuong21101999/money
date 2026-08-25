"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { getDb } from "./firebase";

/**
 * Tin nhắn hai chiều giữa hai người, dùng cho trang /inbox.
 *
 * Phòng CỐ ĐỊNH theo cặp người: id = hai uid sắp xếp rồi nối bằng "__".
 *
 * Đánh dấu bằng UID chứ không phải email — khác với `calls` bên lib/call.ts —
 * vì rules suy quyền thành viên TỪ CHÍNH ID phòng (`uid in threadId.split('__')`)
 * chứ không tra document cha. Hai lý do:
 *
 *  1. Bản trước tra bằng get(threads/$(id)).data.emails, mà lúc mở phòng lần đầu
 *     document cha CHƯA TỒN TẠI: get() trả null, đọc .data là lỗi, nên mọi lượt
 *     mở cuộc trò chuyện mới đều bị từ chối trước khi kịp gửi tin nào.
 *  2. Email có thể chứa dấu gạch dưới, cắt chuỗi bằng "__" sẽ ra sai mảnh. UID
 *     của Firebase chỉ gồm chữ và số nên tách kiểu gì cũng đúng.
 *
 * `at` là số millis do MÁY GỬI đặt chứ không phải serverTimestamp: bản ghi chờ
 * máy chủ xác nhận sẽ có at = null trong snapshot cục bộ, mà orderBy trên field
 * null làm tin vừa gửi nhảy lung tung trước khi yên vị. Lệch giờ giữa hai máy
 * không đáng kể so với cái giật đó.
 */
export interface ChatMessage {
  id: string;
  /** UID người gửi. */
  from: string;
  text: string;
  at: number;
}

/** Id phòng cố định cho một cặp uid (sắp xếp để hai bên ra cùng một id). */
export function threadId(a: string, b: string): string {
  return [a.trim(), b.trim()].sort().join("__");
}

/** Trần số tin tải về. Đủ cho một cuộc trò chuyện, không kéo cả lịch sử. */
const PAGE = 200;

interface Feed {
  /** Phòng mà mớ tin dưới đây thuộc về. */
  id: string | null;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
}

const EMPTY: Feed = { id: null, messages: [], loading: true, error: null };

export function useMessages(id: string | null): Omit<Feed, "id"> {
  const [state, setState] = useState<Feed>(EMPTY);

  useEffect(() => {
    if (!id) return;

    return onSnapshot(
      query(
        collection(getDb(), "threads", id, "messages"),
        orderBy("at", "asc"),
        limit(PAGE),
      ),
      (snap) => {
        const rows = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            from: String(data.from ?? ""),
            text: String(data.text ?? ""),
            at: Number(data.at ?? 0),
          };
        });
        setState({ id, messages: rows, loading: false, error: null });
      },
      (err) => {
        console.error("[chat] messages", err);
        const code = (err as { code?: string })?.code ?? "";
        setState({
          id,
          messages: [],
          loading: false,
          error:
            code === "permission-denied"
              ? "Firestore từ chối. Đã Publish lại firestore.rules với khối threads chưa?"
              : `Không tải được tin nhắn: ${code || String(err)}`,
        });
      },
    );
  }, [id]);

  /*
    So id thay vì dọn state trong effect: đổi phòng thì snapshot cũ vẫn còn nằm
    trong state cho tới khi lượt onSnapshot mới bắn về, mà dọn ngay trong effect
    là gọi setState đồng bộ — thêm một lượt render thừa và bị lint chặn.
  */
  return state.id === id ? state : EMPTY;
}

/**
 * Gửi một tin. Document cha chỉ giữ phần tóm tắt cho danh sách hộp thư — quyền
 * đọc/ghi KHÔNG phụ thuộc vào nó (xem chú thích đầu file), nên ghi trước hay
 * sau đều được; ghi trước cho gọn.
 */
export async function sendMessage(
  from: string,
  to: string,
  text: string,
): Promise<void> {
  const body = text.trim();
  if (!body || !from || !to) return;

  const id = threadId(from, to);
  const at = Date.now();

  await setDoc(
    doc(getDb(), "threads", id),
    { uids: [from, to].sort(), lastAt: at, lastText: body },
    { merge: true },
  );

  await addDoc(collection(getDb(), "threads", id, "messages"), {
    from,
    text: body,
    at,
  });
}
