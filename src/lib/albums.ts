"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "./firebase";
import { describeWriteError } from "./photos";

/**
 * Album ảnh. Mỗi album là một thư mục thật trên Drive:
 *
 *   Thư viện ảnh — Sổ tiền/ban@gmail.com/Tên album/anh.jpg
 *
 * Firestore giữ tên, logo và driveFolderId; Drive giữ bytes. Hai bên nối với
 * nhau qua driveFolderId, và quyền sở hữu thư mục neo ở appProperties.ownerUid
 * bên Drive (xem /api/albums) nên server kiểm được mà không cần đọc Firestore.
 */
export interface Album {
  id: string;
  name: string;
  /** Thư mục trên Drive. Ảnh trong album này upload vào đúng thư mục đó. */
  driveFolderId: string;
  /** data URL WebP 200px. "" = không có logo, bìa album vẽ bằng chữ viết tắt. */
  logo: string;
  /**
   * Số ảnh trong album, để lưới album hiện được "N ảnh".
   *
   * VÌ SAO ĐẾM SẴN Ở ĐÂY THAY VÌ ĐẾM LÚC HIỆN
   * Đếm thật thì phải tải danh sách ảnh, mà mỗi ảnh mang một thumb ~10KB — kéo
   * về vài MB chỉ để hiện một con số. Aggregation query (getCountFromServer)
   * tránh được chỗ đó nhưng mỗi album một vòng gọi mạng, không realtime, và
   * offline thì không ra gì.
   *
   * Con số này đi kèm luôn trong document album nên miễn phí, cập nhật realtime
   * và chạy được cả khi offline. Nó KHÔNG lệch được: mọi lần tăng/giảm đều nằm
   * chung một writeBatch với chính lần ghi/xoá ảnh (xem uploadPhoto,
   * deletePhoto) — hai việc cùng thành công hoặc cùng thất bại.
   *
   * undefined ở album tạo trước khi có trường này; đọc ra thì coi như 0.
   */
  photoCount?: number;
  createdAt: number;
}

function albumCollection(uid: string) {
  return collection(getDb(), "users", uid, "albums");
}

interface Loadable<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

const NO_ALBUMS: Loadable<Album[]> = { data: [], loading: false, error: null };
const GIVE_UP_MS = 8_000;

/** Nghe realtime danh sách album, mới nhất lên đầu. */
export function useAlbums(uid: string | undefined): Loadable<Album[]> {
  const [state, setState] = useState<Loadable<Album[]>>({
    data: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!uid) return;

    const giveUp = setTimeout(
      () => setState((s) => ({ ...s, loading: false })),
      GIVE_UP_MS,
    );

    const stop = onSnapshot(
      query(albumCollection(uid), orderBy("createdAt", "desc")),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Album);
        // Rỗng-mà-từ-cache chưa phải "đã có dữ liệu" — xem ghi chú ở usePhotos.
        const settled = !snap.metadata.fromCache || rows.length > 0;
        if (settled) clearTimeout(giveUp);
        setState((s) => ({ data: rows, loading: s.loading && !settled, error: null }));
      },
      (err) => {
        clearTimeout(giveUp);
        console.error("[albums]", err);
        const code = (err as { code?: string })?.code ?? "";
        setState({
          data: [],
          loading: false,
          error:
            code === "permission-denied"
              ? "Firestore từ chối đọc album. Kiểm tra đã Publish lại firestore.rules chưa."
              : `Lỗi đọc album: ${code || String(err)}`,
        });
      },
    );

    return () => {
      clearTimeout(giveUp);
      stop();
    };
  }, [uid]);

  return uid ? state : NO_ALBUMS;
}

/**
 * Nghe một album. Dùng listener một document chứ không lọc từ useAlbums: mỗi
 * album mang một logo ~10KB, tải cả danh sách chỉ để lấy một cái là kéo về cả
 * chục logo không dùng tới.
 *
 * `data` là null khi album không tồn tại (hoặc vừa bị xoá) — trang gọi nó dùng
 * điều đó để hiện "không tìm thấy" thay vì treo ở màn chờ.
 */
export function useAlbum(
  uid: string | undefined,
  id: string | undefined,
): Loadable<Album | null> {
  const [state, setState] = useState<Loadable<Album | null>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!uid || !id) return;

    const giveUp = setTimeout(
      () => setState((s) => ({ ...s, loading: false })),
      GIVE_UP_MS,
    );

    const stop = onSnapshot(
      doc(albumCollection(uid), id),
      (snap) => {
        clearTimeout(giveUp);
        setState({
          // Document không tồn tại và "chưa biết" trông giống nhau khi đọc từ
          // cache, nhưng ở đây snapshot đầu nào cũng tính là chốt — chờ thêm thì
          // ai vào album cũng phải đợi trọn một vòng mạng.
          data: snap.exists() ? ({ id: snap.id, ...snap.data() } as Album) : null,
          loading: false,
          error: null,
        });
      },
      (err) => {
        clearTimeout(giveUp);
        console.error("[album]", err);
        const code = (err as { code?: string })?.code ?? "";
        setState({
          data: null,
          loading: false,
          error:
            code === "permission-denied"
              ? "Firestore từ chối đọc album. Kiểm tra đã Publish lại firestore.rules chưa."
              : `Lỗi đọc album: ${code || String(err)}`,
        });
      },
    );

    return () => {
      clearTimeout(giveUp);
      stop();
    };
  }, [uid, id]);

  return uid && id ? state : { data: null, loading: false, error: null };
}

/**
 * Tạo album: thư mục trên Drive TRƯỚC, document Firestore SAU.
 *
 * Ngược lại thì một album ghi xong mà thư mục hỏng sẽ nằm đó không upload được
 * gì, và người dùng không hiểu tại sao. Tạo thư mục trước thì tệ nhất là có một
 * thư mục rỗng trên Drive — vô hại, và bấm tạo lại cùng tên sẽ dùng lại đúng nó
 * chứ không sinh thêm (xem ensureFolder).
 */
export async function createAlbum(
  uid: string,
  idToken: string,
  input: { name: string; logo?: string },
): Promise<string> {
  const response = await fetch("/api/albums", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ name: input.name }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? "Không tạo được album.");

  try {
    const created = await addDoc(albumCollection(uid), {
      // Dùng tên Drive đã làm sạch, không dùng chuỗi người dùng gõ — để tên trong
      // app và tên thư mục trên Drive luôn khớp nhau.
      name: payload.name as string,
      driveFolderId: payload.driveFolderId as string,
      logo: input.logo ?? "",
      photoCount: 0,
      createdAt: Date.now(),
    });
    return created.id;
  } catch (e) {
    /*
      Bước này reject là album KHÔNG được tạo, nhưng nó vẫn hiện một lúc trong
      lưới vì Firestore ghi lạc quan vào cache trước rồi mới hỏi server. Người
      dùng thấy album xuất hiện mà app không tự vào album đó — đúng triệu chứng
      đã gặp, và nguyên nhân thật là logo vượt 60000 ký tự.

      Thư mục Drive tạo ở trên thành mồ côi. Không dọn ở đây: ensureFolder là
      idempotent nên bấm tạo lại cùng tên sẽ dùng lại đúng thư mục đó.
    */
    throw describeWriteError(e);
  }
}

/** Đổi tên album ở cả hai nơi. Drive trước, vì đó là chỗ có thể từ chối. */
export async function renameAlbum(
  uid: string,
  album: Album,
  idToken: string,
  name: string,
): Promise<void> {
  const response = await fetch(
    `/api/albums/${encodeURIComponent(album.driveFolderId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ name }),
    },
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? "Không đổi được tên album.");

  await updateDoc(doc(albumCollection(uid), album.id), { name: payload.name });
}

/** Logo chỉ nằm trong Firestore, không liên quan Drive. */
export async function setAlbumLogo(
  uid: string,
  id: string,
  logo: string,
): Promise<void> {
  await updateDoc(doc(albumCollection(uid), id), { logo });
}

/**
 * Xoá album và MỌI ảnh trong đó.
 *
 * Thứ tự: thư mục Drive trước (xoá thư mục là xoá luôn bytes bên trong), rồi
 * document ảnh, rồi document album. Xoá document trước thì nếu bước Drive hỏng,
 * app mất luôn driveFolderId — thư mục nằm lại trên Drive vĩnh viễn không dọn
 * được từ trong app.
 *
 * Tự truy danh sách ảnh chứ không nhận từ người gọi: hàm này gọi được từ lưới
 * album, nơi cố tình KHÔNG tải ảnh (xem AlbumLibrary). Bắt người gọi phải có
 * sẵn danh sách ảnh nghĩa là chỉ xoá được album khi đang đứng trong nó.
 */
export async function deleteAlbum(
  uid: string,
  album: Album,
  idToken: string,
): Promise<void> {
  const response = await fetch(
    `/api/albums/${encodeURIComponent(album.driveFolderId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${idToken}` } },
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? "Không xoá được thư mục album trên Drive.");
  }

  const db = getDb();
  const images = collection(db, "users", uid, "images");
  const owned = await getDocs(query(images, where("albumId", "==", album.id)));

  // Firestore chặn 500 thao tác mỗi batch; chia 400 cho còn dư.
  for (let i = 0; i < owned.docs.length; i += 400) {
    const batch = writeBatch(db);
    for (const snap of owned.docs.slice(i, i + 400)) batch.delete(snap.ref);
    await batch.commit();
  }

  await deleteDoc(doc(albumCollection(uid), album.id));
}

/* --------------------------------------------------------------------------
   Bìa album khi không có logo
   -------------------------------------------------------------------------- */

/**
 * Chữ viết tắt của tên album: hai từ đầu lấy mỗi từ một chữ, một từ thì lấy một chữ.
 *
 * Duyệt bằng [...name] chứ không name[0]: chữ có dấu tổ hợp và emoji chiếm nhiều
 * hơn một đơn vị mã, cắt bằng chỉ số sẽ ra nửa ký tự và hiện thành ô vuông.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = [...words[0]][0] ?? "";
  if (words.length === 1) return first.toUpperCase();
  const second = [...words[1]][0] ?? "";
  return (first + second).toUpperCase();
}

/*
  Bìa không có logo dùng class `bg-brand` — ĐÚNG dải màu của nút chính và của
  logo app (--ramp trong globals.css).

  Trước đây chỗ này có một bảng sáu gradient tự đặt, chọn theo hash của tên để
  mỗi album một màu. Bỏ đi vì cả sáu đều lệch tông: cái gần nhất vẫn thiếu chặng
  giữa #c0208d 45%, nên nó đi thẳng từ tím sang hồng chứ không qua cánh sen —
  đứng cạnh nút "Tạo album" là thấy ngay hai màu khác nhau.

  Đánh đổi: mọi album không logo giờ trông giống nhau. Chấp nhận, vì nhận diện
  album là việc của TÊN và LOGO; màu là việc của thương hiệu, và thương hiệu chỉ
  có một. Muốn album khác màu nhau thì đặt logo.
*/
