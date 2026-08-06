"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  increment,
  limit,
  onSnapshot,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "./firebase";
import { makeThumbnail } from "./photo-thumb";

/**
 * Thư viện ảnh: bytes trên Google Drive, metadata trong Firestore.
 *
 * PHÂN VAI
 * Drive giữ BẢN GỐC — không nén, không thu nhỏ, lấy về được đúng bytes đã đẩy
 * lên. Firestore giữ mọi thứ cần để LIỆT KÊ, LỌC và SẮP XẾP, cộng thêm thumb
 * 200px để lưới ảnh vẽ ra tức thì.
 *
 * Đây là lý do không nhét ảnh vào Firestore: document bị chặn ở 1MB, và một
 * query trả về 30 ảnh base64 là 30 lần tải bytes ảnh chỉ để hiện một cái lưới.
 * Ngược lại cũng không để metadata trên Drive: Drive không cho where/orderBy,
 * muốn lọc theo thẻ hay xếp theo ngày là phải tải toàn bộ danh sách về rồi tự lọc.
 */

export interface Photo {
  id: string;
  /** Mã file trên Drive — dùng làm địa chỉ tải bản gốc qua /api/images/[id]. */
  driveFileId: string;
  /**
   * Album chứa ảnh này, là id document album trong Firestore.
   *
   * Ảnh upload trước khi có album không có field này — nên đọc ra phải chịu được
   * undefined, và photosOfAlbum() lọc theo so sánh chặt để chúng không lẫn vào
   * album nào cả.
   */
  albumId: string;
  name: string;
  mimeType: string;
  /** Bytes của bản gốc. */
  size: number;
  /** Kích thước ảnh gốc; null khi trình duyệt không giải mã được để đo. */
  width: number | null;
  height: number | null;
  /** data URL WebP 200px. "" khi không tạo được thumb (vd ảnh HEIC trên Chrome). */
  thumb: string;
  note: string;
  tags: string[];
  /**
   * Mốc thời gian tạo, tính bằng milli.
   *
   * Ghi bằng đồng hồ MÁY NGƯỜI DÙNG, không phải serverTimestamp(). Đánh đổi có
   * chủ ý: serverTimestamp() trả null cho tới khi server xác nhận, nên ảnh vừa
   * upload sẽ không có chỗ đứng trong danh sách đang sắp theo thời gian — nó
   * nhảy một nhịp rồi mới vào đúng vị trí. Lệch đồng hồ vài phút thì thư viện
   * ảnh cá nhân không ai thấy, còn ảnh nhảy chỗ thì ai cũng thấy.
   */
  createdAt: number;
}

/** Trần một lượt đọc. Thư viện to hơn thì phân trang, đừng nong số này lên. */
const PAGE_SIZE = 300;

function photoCollection(uid: string) {
  return collection(getDb(), "users", uid, "images");
}

interface Loadable<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

const NO_PHOTOS: Loadable<Photo[]> = { data: [], loading: false, error: null };

/** Mất mạng mà cache trên đĩa cũng rỗng thì đừng để người ta ngắm vòng xoay mãi. */
const GIVE_UP_MS = 8_000;

/**
 * Nghe realtime ảnh trong MỘT album.
 *
 * Lọc theo album ở tầng Firestore chứ không tải hết rồi lọc trên máy: mỗi
 * document mang một thumb ~10KB, nên tải cả thư viện 300 ảnh để hiện một album
 * là kéo về 3MB mà dùng có một phần.
 *
 * Nhưng CỐ Ý không kèm orderBy: where + orderBy trên hai field khác nhau là
 * Firestore đòi composite index phải khai bằng tay, thêm một bước setup nữa cho
 * người dùng. Chỉ where thì index đơn có sẵn, và việc sắp xếp đã có sortPhotos
 * làm ở client — vài trăm ảnh thì sắp trên máy nhanh hơn một vòng gọi mạng.
 */
export function usePhotos(
  uid: string | undefined,
  albumId: string | undefined,
): Loadable<Photo[]> {
  const [state, setState] = useState<Loadable<Photo[]>>({
    data: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!uid || !albumId) return;

    const giveUp = setTimeout(
      () => setState((s) => ({ ...s, loading: false })),
      GIVE_UP_MS,
    );

    const stop = onSnapshot(
      query(photoCollection(uid), where("albumId", "==", albumId), limit(PAGE_SIZE)),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Photo);
        // Rỗng-mà-từ-cache chưa phải là "đã có dữ liệu": tắt màn chờ lúc đó thì
        // người dùng thấy thư viện trống rồi ảnh mới đổ về sau. Giống cách
        // useTransactions xử lý, vì đây đúng là cùng một cái bẫy.
        const settled = !snap.metadata.fromCache || rows.length > 0;
        if (settled) clearTimeout(giveUp);
        setState((s) => ({
          data: rows,
          loading: s.loading && !settled,
          error: null,
        }));
      },
      (err) => {
        clearTimeout(giveUp);
        console.error("[photos]", err);
        const code = (err as { code?: string })?.code ?? "";
        setState({
          data: [],
          loading: false,
          error:
            code === "permission-denied"
              ? "Firestore từ chối đọc thư viện ảnh. Kiểm tra đã Publish lại firestore.rules chưa."
              : `Lỗi đọc thư viện ảnh: ${code || String(err)}`,
        });
      },
    );

    return () => {
      clearTimeout(giveUp);
      stop();
    };
  }, [uid, albumId]);

  return uid && albumId ? state : NO_PHOTOS;
}

export interface UploadOptions {
  uid: string;
  idToken: string;
  /** Album chứa ảnh — id document Firestore. */
  albumId: string;
  /** Thư mục Drive của album đó. Server kiểm nó có đúng của người gọi không. */
  parentFolderId: string;
  note?: string;
  tags?: string[];
  /** 0..1, gọi liên tục trong lúc đẩy bytes. */
  onProgress?: (ratio: number) => void;
  /**
   * Huỷ lượt đẩy này. Abort giữa đường thì bytes đã lên Drive KHÔNG được ghi vào
   * Firestore, nên file thành mồ côi trên Drive — đổi lấy việc người dùng dừng
   * được ngay thay vì ngồi đợi hết một hàng đợi mười tấm.
   */
  signal?: AbortSignal;
}

/**
 * Đưa một tấm ảnh lên Drive rồi ghi metadata vào Firestore.
 *
 * Ba chặng, và thứ tự quan trọng:
 *   1. Tạo thumb tại máy — làm trước để nếu ảnh hỏng thì biết ngay, chưa tốn
 *      lượt gọi mạng nào.
 *   2. Xin session rồi PUT bytes THẲNG lên Google, không qua server của mình.
 *   3. Ghi Firestore SAU CÙNG, khi đã có driveFileId thật.
 *
 * Ghi Firestore trước rồi upload sẽ để lại document trỏ vào một file không tồn
 * tại nếu bytes đẩy hỏng giữa đường — thư viện có ô ảnh mở ra là lỗi 404, mà
 * không có cách nào tự biết để dọn.
 *
 * Chiều ngược lại vẫn còn một khe hở: bytes lên Drive xong mà ghi Firestore
 * hỏng thì file nằm mồ côi trên Drive, tốn chỗ mà app không thấy. Chấp nhận —
 * nó chỉ tốn dung lượng chứ không làm sai dữ liệu, và dọn được bằng tay trong
 * thư mục Drive.
 */
export async function uploadPhoto(file: File, options: UploadOptions): Promise<void> {
  const thumb = await makeThumbnail(file);

  const session = await fetch("/api/images/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.idToken}`,
    },
    body: JSON.stringify({
      name: file.name,
      mimeType: file.type,
      size: file.size,
      parentFolderId: options.parentFolderId,
    }),
    signal: options.signal,
  });

  const sessionPayload = await session.json().catch(() => null);
  if (!session.ok) {
    throw new Error(sessionPayload?.error ?? "Không xin được phép upload.");
  }

  const driveFileId = await putBytes(
    sessionPayload.uploadUrl,
    file,
    options.onProgress,
    options.signal,
  );

  /*
    Ghi document ảnh và tăng photoCount của album trong CÙNG một batch.

    Hai lời gọi rời nhau thì lần thứ hai hỏng là số đếm lệch vĩnh viễn, và không
    có cách nào tự phát hiện — lưới album hiện "5 ảnh" trong khi bên trong có 6.
    Batch thì hai việc cùng thành công hoặc cùng thất bại.
  */
  const db = getDb();
  const batch = writeBatch(db);

  // doc() không tham số phụ = tự sinh id, giống addDoc nhưng lấy được ref trước
  // khi ghi, nên nhét vào batch được.
  batch.set(doc(photoCollection(options.uid)), {
    driveFileId,
    albumId: options.albumId,
    name: file.name,
    mimeType: file.type,
    size: file.size,
    width: thumb?.width ?? null,
    height: thumb?.height ?? null,
    thumb: thumb?.dataUrl ?? "",
    note: options.note ?? "",
    tags: options.tags ?? [],
    createdAt: Date.now(),
  });
  batch.update(doc(db, "users", options.uid, "albums", options.albumId), {
    photoCount: increment(1),
  });

  try {
    await batch.commit();
  } catch (e) {
    // Bytes đã lên Drive xong mới tới bước này, nên lỗi ở đây để lại file mồ côi.
    // Nói rõ nguyên nhân thay vì để nguyên "Missing or insufficient permissions".
    throw describeWriteError(e);
  }
}

/**
 * Đẩy bytes lên session URI của Google.
 *
 * Dùng XMLHttpRequest chứ không fetch: fetch KHÔNG báo tiến trình upload được
 * (không có upload.onprogress), mà đẩy một tấm ảnh 8MB qua 4G là chuyện của vài
 * chục giây — không có thanh tiến trình thì người dùng tưởng app treo.
 */
function putBytes(
  uploadUrl: string,
  file: File,
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Đã huỷ gửi ảnh.", "AbortError"));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", file.type);

    // XHR không nhận AbortSignal như fetch, phải tự nối: nghe abort rồi gọi
    // xhr.abort(), và tháo listener khi xong để không giữ tham chiếu tới xhr đã chết.
    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    xhr.onloadend = () => signal?.removeEventListener("abort", onAbort);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        console.error("[photos] PUT thất bại", xhr.status, xhr.responseText);
        reject(new Error(`Google từ chối nhận ảnh (${xhr.status}).`));
        return;
      }
      try {
        const id = JSON.parse(xhr.responseText)?.id;
        if (!id) throw new Error("thiếu id");
        resolve(id);
      } catch {
        reject(new Error("Google nhận ảnh nhưng không trả về mã file."));
      }
    };

    // Lỗi mạng và lỗi CORS đều rơi vào đây, và trình duyệt cố tình không nói rõ
    // là cái nào. Nhắc CORS vì đó là nguyên nhân hay gặp nhất lúc mới dựng: quên
    // chuyển tiếp header Origin khi tạo session thì mọi cú PUT đều chết ở đây.
    xhr.onerror = () =>
      reject(
        new Error(
          "Không gửi được ảnh lên Google. Kiểm tra mạng, hoặc xem route session có chuyển tiếp header Origin chưa.",
        ),
      );
    xhr.onabort = () => reject(new DOMException("Đã huỷ gửi ảnh.", "AbortError"));

    xhr.send(file);
  });
}

/**
 * Xoá ảnh: bỏ file trên Drive TRƯỚC, rồi mới bỏ document.
 *
 * Xoá document trước thì nếu bước Drive hỏng, file nằm lại trên Drive mà app
 * không còn mã nào để trỏ tới — vĩnh viễn không dọn được từ trong app. Ngược
 * lại thì tệ nhất là document trỏ vào file đã mất, và người dùng bấm xoá lần
 * nữa là xong (route trả 404 nhưng vẫn coi là thành công).
 */
export async function deletePhoto(
  uid: string,
  photo: Photo,
  idToken: string,
): Promise<void> {
  const response = await fetch(`/api/images/${encodeURIComponent(photo.driveFileId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? "Không xoá được ảnh trên Drive.");
  }

  // Xoá document và giảm số đếm cùng một batch — xem ghi chú ở uploadPhoto.
  const db = getDb();
  const batch = writeBatch(db);
  batch.delete(doc(photoCollection(uid), photo.id));
  // Ảnh cũ chưa có albumId (ghi trước khi có album) thì không có album nào để
  // trừ. Không chặn bằng if là batch nhắm vào doc "albums/" rỗng và ném lỗi.
  if (photo.albumId) {
    batch.update(doc(db, "users", uid, "albums", photo.albumId), {
      photoCount: increment(-1),
    });
  }
  await batch.commit();
}

/*
  Từng có updatePhoto() để sửa ghi chú và thẻ ngay trong viewer. Bỏ đi cùng lúc
  bỏ hai ô nhập đó khỏi viewer — hàm không còn ai gọi.

  Hai field `note` và `tags` vẫn nằm trong document (ghi rỗng lúc upload) vì
  firestore.rules đang kiểm `tags is list`; gỡ chúng đòi sửa và Publish lại rules,
  mà giữ lại thì không tốn gì đáng kể.
*/
/**
 * Tải bản gốc về dạng Blob.
 *
 * Không thể gán thẳng /api/images/[id] vào <img src>: thẻ img không gửi được
 * header Authorization, mà route thì bắt buộc phải có ID token để biết ai đang
 * xem. Nên phải tải bằng fetch.
 *
 * Trả về Blob chứ không phải blob URL, vì người gọi cần CẢ HAI: URL để đưa vào
 * <img src>, và chính Blob để dựng File cho Web Share API khi lưu về máy trên
 * iOS. Tạo URL ở đây rồi thì không lấy lại được Blob.
 *
 * NGƯỜI GỌI tự createObjectURL và PHẢI revokeObjectURL khi đóng ảnh — không thì
 * mỗi lần mở một tấm là giữ lại vài MB trong RAM tới khi tải lại trang.
 */
export async function fetchOriginal(photo: Photo, idToken: string): Promise<Blob> {
  const response = await fetch(`/api/images/${encodeURIComponent(photo.driveFileId)}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? "Không tải được ảnh gốc.");
  }
  return await response.blob();
}

/* --------------------------------------------------------------------------
   Sắp xếp — làm ở client, xem ghi chú ở usePhotos về lý do.
   -------------------------------------------------------------------------- */

export type SortKey = "newest" | "oldest";

export const SORT_LABELS: Record<SortKey, string> = {
  newest: "Mới nhất",
  oldest: "Cũ nhất",
};

const COMPARATORS: Record<SortKey, (a: Photo, b: Photo) => number> = {
  // So id khi hai ảnh trùng mốc thời gian, để thứ tự cố định giữa các lần render
  // thay vì nhảy chỗ — chọn nhiều ảnh một lượt thì createdAt trùng nhau là thường.
  newest: (a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id),
  oldest: (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
};

export function sortPhotos(photos: Photo[], sort: SortKey): Photo[] {
  // Sao chép trước khi sort: sort() sửa tại chỗ, mà mảng này đến từ state của
  // React — sửa tại chỗ là sửa thẳng vào state và React không thấy gì thay đổi.
  return [...photos].sort(COMPARATORS[sort]);
}

/* --------------------------------------------------------------------------
   Lưu ảnh về máy
   -------------------------------------------------------------------------- */

/**
 * Máy này có phải iOS/iPadOS không.
 *
 * Phải nhận diện theo NỀN TẢNG, không phải theo trình duyệt: Chrome và Firefox
 * trên iPhone cũng chạy WebKit nên cùng chung giới hạn.
 *
 * Không có cách nhận biết bằng feature detection: `"download" in
 * HTMLAnchorElement.prototype` trả true cả trên iOS — thuộc tính CÓ trong DOM,
 * iOS chỉ lặng lẽ không làm gì với nó. Nên đành đọc platform.
 *
 * iPadOS 13 trở lên tự báo là "MacIntel" để giả dạng máy tính, nên phải kiểm thêm
 * số điểm cảm ứng mới phân biệt được với Mac thật.
 */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const iPadPretendingToBeMac =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(navigator.platform) || iPadPretendingToBeMac;
}

/**
 * Có PHẢI đi đường Web Share để lưu được file hay không.
 *
 * Chỉ đúng trên iOS, nơi <a download> bị bỏ qua hoàn toàn — bấm vào chỉ mở trang
 * xem trước "Mở trong iMovie…", không lưu gì.
 *
 * CỐ Ý không dùng "cứ có canShare thì share": Chrome/Edge trên Windows và Safari
 * trên macOS đều có canShare({files}), mà ở đó <a download> chạy hoàn hảo và tải
 * thẳng là thứ người dùng mong đợi. Đi đường share ở đó là bắt họ qua thêm một
 * bảng chia sẻ của hệ điều hành để làm một việc lẽ ra chỉ cần một cú bấm.
 */
export function needsShareToSave(files: File[]): boolean {
  return isIOS() && Boolean(navigator.canShare?.({ files }));
}

/**
 * Tải các file về máy bằng thẻ <a download>.
 *
 * Tự tạo và thu hồi blob URL cho từng file: giữ lại thì mỗi lần lưu là thêm vài MB
 * nằm trong RAM tới khi tải lại trang.
 *
 * Gắn thẻ vào DOM trước khi click — Firefox bỏ qua click trên thẻ chưa nằm trong
 * tài liệu.
 */
export function downloadFiles(files: File[]): void {
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
}

/**
 * Dịch lỗi ghi Firestore sang câu người dùng hiểu được.
 *
 * `permission-denied` chỉ trả về "Missing or insufficient permissions" — không
 * nói field nào sai, không nói vì sao. Với thư viện ảnh thì gần như luôn là một
 * trong hai nguyên nhân dưới đây, nên nói thẳng ra còn hơn để người dùng đoán.
 *
 * Đã từng mất cả một vòng gỡ lỗi vì câu thông báo này: logo vượt 60000 ký tự làm
 * addDoc reject, album vẫn hiện trong lưới do Firestore ghi lạc quan, nên trông
 * như "tạo xong mà không tự vào album".
 */
export function describeWriteError(error: unknown): Error {
  const code = (error as { code?: string })?.code ?? "";
  if (code === "permission-denied") {
    return new Error(
      "Firestore từ chối ghi. Thường do ảnh xem trước quá lớn, hoặc chưa Publish lại firestore.rules.",
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

/** "1,4 MB" — đọc nhanh hơn 1468006. */
export function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
