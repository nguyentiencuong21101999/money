import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, query } from "firebase/firestore";
import { getFirebaseAuth, getDb } from "./firebase";

/**
 * Đọc thư viện ảnh mà bản WEB đã upload lên Google Drive.
 *
 * PHÂN VAI (giống hệt bên web, xem ../../src/lib/photos.ts):
 *   • Firestore `users/{uid}/images` giữ metadata + `thumb` (data URL 200px).
 *   • Bản GỐC nằm trên Drive, không có URL công khai — phải lấy qua API của web
 *     `GET {WEB_URL}/api/images/{driveFileId}` kèm `Authorization: Bearer <idToken>`.
 *     Token đó là Firebase idToken của chính người đang đăng nhập; mobile dùng
 *     chung tài khoản với web nên đọc được đúng ảnh của mình.
 *
 * Không nói chuyện thẳng với Drive: credential Drive nằm ở server của web, nhét
 * vào app điện thoại là lộ ra tay người dùng.
 */

/** URL web đã deploy, ví dụ https://abc.vercel.app — đặt trong mobile/.env. */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? "").replace(/\/$/, "");
export const webConfigured = WEB_URL.length > 0;

export interface Photo {
  id: string;
  /** Mã file trên Drive — địa chỉ tải bản gốc. */
  driveFileId: string;
  albumId?: string;
  name: string;
  /** data URL WebP 200px, hiện tạm trong lúc chờ ảnh gốc. */
  thumb: string;
  width: number | null;
  height: number | null;
  createdAt: number;
}

/** Trần một lượt đọc — thư viện to hơn thì phân trang, giống bên web. */
const PAGE_SIZE = 300;

export function usePhotos(uid: string | undefined) {
  const [images, setImages] = useState<Photo[]>([]);
  // Id các album CÒN TỒN TẠI. Chỉ hiện ảnh thuộc album còn sống — khớp với web,
  // loại ảnh mồ côi (không album) và ảnh của album đã bị xoá (doc album mất nhưng
  // ảnh còn nằm lại trong Firestore).
  const [albumIds, setAlbumIds] = useState<Set<string>>(new Set());
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [albumsLoaded, setAlbumsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setImages([]);
      setAlbumIds(new Set());
      setImagesLoaded(true);
      setAlbumsLoaded(true);
      return;
    }
    setImagesLoaded(false);
    setAlbumsLoaded(false);

    const onErr = (err: unknown) => {
      const code = (err as { code?: string })?.code ?? "";
      setError(
        code === "permission-denied"
          ? "Firestore từ chối đọc thư viện ảnh."
          : `Lỗi đọc thư viện ảnh: ${code || String(err)}`,
      );
    };

    const stopAlbums = onSnapshot(
      collection(getDb(), "users", uid, "albums"),
      (snap) => {
        setAlbumIds(new Set(snap.docs.map((d) => d.id)));
        setAlbumsLoaded(true);
      },
      onErr,
    );

    const stopImages = onSnapshot(
      query(collection(getDb(), "users", uid, "images"), limit(PAGE_SIZE)),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Photo);
        // Không orderBy ở Firestore (tránh khai composite index) — sắp ở máy, mới
        // nhất lên đầu.
        rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        setImages(rows.filter((p) => p.driveFileId));
        setImagesLoaded(true);
        setError(null);
      },
      onErr,
    );

    return () => {
      stopAlbums();
      stopImages();
    };
  }, [uid]);

  const photos = images.filter((p) => p.albumId && albumIds.has(p.albumId));
  return { photos, loading: !imagesLoaded || !albumsLoaded, error };
}

/** Địa chỉ ảnh gốc trên server web. */
export function photoUrl(driveFileId: string): string {
  return `${WEB_URL}/api/images/${encodeURIComponent(driveFileId)}`;
}

/**
 * Header xác thực cho <Image source={{ uri, headers }}> và fetch.
 * Token sống ~1 giờ, Firebase tự làm mới nên gọi lại mỗi lần dùng.
 */
export async function authHeaders(): Promise<Record<string, string> | null> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return null;
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

/**
 * Tải ảnh gốc về dạng base64 để đưa cho native vẽ vào ô PiP.
 *
 * Vì sao JS tải chứ không để native tự tải: đường lấy ảnh cần idToken của
 * Firebase, thứ chỉ có ở tầng JS. Native chỉ nhận bytes, khỏi biết gì về auth.
 */
export async function fetchPhotoBase64(driveFileId: string): Promise<string | null> {
  if (!webConfigured) return null;
  const headers = await authHeaders();
  if (!headers) return null;

  const res = await fetch(photoUrl(driveFileId), { headers });
  if (!res.ok) return null;

  const blob = await res.blob();
  return await new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const out = typeof reader.result === "string" ? reader.result : null;
      // Bỏ tiền tố "data:image/jpeg;base64," — native chỉ cần phần base64.
      resolve(out ? out.replace(/^data:[^;]+;base64,/, "") : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}
