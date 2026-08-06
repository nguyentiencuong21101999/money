"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  deletePhoto,
  downloadFiles,
  fetchOriginal,
  formatBytes,
  needsShareToSave,
  type Photo,
} from "@/lib/photos";
import { ConfirmDialog } from "./ConfirmDialog";
import { LoadingMark } from "./LoadingMark";

interface Props {
  photo: Photo;
  uid: string;
  idToken: string;
  onClose: () => void;
  /** Gọi sau khi xoá xong để đóng viewer — danh sách tự cập nhật qua onSnapshot. */
  onDeleted: () => void;
}

/**
 * Xem ảnh gốc hết màn hình, kèm lưu về máy và xoá.
 *
 * KHÔNG dùng lại PhotoView của sổ tiền: bên đó chặn phóng to ở 1280px vì ảnh lưu
 * kèm giao dịch chỉ có 900px, phóng hơn nữa chỉ được thêm ảnh nhoè. Ở đây ảnh là
 * BẢN GỐC vài nghìn điểm ảnh, chặn ở 1280px là ném đi đúng phần chi tiết mà cả
 * kiến trúc này dựng ra để giữ.
 *
 * Ảnh phải tải bằng fetch rồi bọc blob — thẻ img không gửi được header
 * Authorization mà route đọc ảnh thì bắt buộc phải có ID token. Nên ở đây có một
 * trạng thái chờ mà PhotoView không có.
 */
export function PhotoViewer({ photo, uid, idToken, onClose, onDeleted }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  /** Giữ luôn Blob, không chỉ URL: Web Share API cần một File thật để lưu về máy. */
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Đang chờ xác nhận xoá — popup riêng, không dùng confirm() của trình duyệt. */
  const [confirming, setConfirming] = useState(false);

  // Tải bản gốc. Cleanup phải revoke blob URL: mỗi tấm ảnh gốc là vài MB nằm
  // trong RAM, mở chục tấm mà không thu hồi là tab phình lên tới lúc tải lại trang.
  useEffect(() => {
    let url: string | null = null;
    let alive = true;

    fetchOriginal(photo, idToken)
      .then((bytes) => {
        const objectUrl = URL.createObjectURL(bytes);
        url = objectUrl;
        // Đóng viewer trước khi ảnh về xong thì thu hồi ngay, đừng setState vào
        // component đã tháo.
        if (!alive) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setBlob(bytes);
        setSrc(objectUrl);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo, idToken]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Bắt ở pha capture rồi chặn lại, giống PhotoView: để phím chạy tiếp thì
      // lớp bên dưới cũng nghe Escape và đóng theo.
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const closeIfOutside = (e: MouseEvent<HTMLElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  /**
   * Lưu bản gốc về máy.
   *
   * Chỉ iOS mới phải qua bảng chia sẻ vì ở đó <a download> bị bỏ qua — xem
   * needsShareToSave(). Máy khác tải thẳng.
   *
   * Ở đây KHÔNG cần cú bấm thứ hai như lúc lưu nhiều ảnh: Blob đã nằm trong RAM
   * từ lúc mở ảnh, không phải chờ mạng, nên cử chỉ bấm vẫn còn hiệu lực khi gọi
   * navigator.share.
   */
  async function save() {
    if (!blob) return;

    const file = new File([blob], photo.name || "anh.jpg", {
      type: photo.mimeType || blob.type || "image/jpeg",
    });

    if (needsShareToSave([file])) {
      try {
        await navigator.share({ files: [file], title: file.name });
        return;
      } catch (e) {
        // Bấm huỷ bảng chia sẻ không phải lỗi.
        if ((e as { name?: string })?.name === "AbortError") return;
        console.error("[photos] share thất bại, thử tải trực tiếp", e);
      }
    }

    downloadFiles([file]);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deletePhoto(uid, photo, idToken);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const size = [
    photo.width && photo.height ? `${photo.width}×${photo.height}` : null,
    formatBytes(photo.size),
    new Date(photo.createdAt).toLocaleString("vi-VN"),
  ]
    .filter(Boolean)
    .join(" · ");

  return createPortal(
    <div
      onClick={closeIfOutside}
      /*
        page-surface = đúng dải màu nền trang (xem globals.css). Khác
        .sheet-surface ở chỗ không có màn trắng --surface-veil, vì lớp này CHÍNH
        LÀ nền chứ không phải panel nổi trên nền.

        Đánh đổi cần biết: nền sáng làm mắt thích nghi theo nó nên ảnh trông nhạt
        màu hơn so với nền tối — đó là lý do các trình xem ảnh chuyên dụng đều
        dùng nền tối. Ở đây chọn liền mạch với app.
      */
      className="animate-fade page-surface fixed inset-0 z-60 flex flex-col"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{photo.name}</p>
          <p className="text-muted mt-0.5 truncate text-xs">{size}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="text-muted hover:bg-expense/8 hover:text-ink -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-2xl leading-none transition active:scale-90"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-auto" onClick={closeIfOutside}>
        <div
          onClick={closeIfOutside}
          className="flex min-h-full min-w-full items-center justify-center p-4"
        >
          {error ? (
            <p className="border-critical/40 bg-critical/6 text-critical max-w-sm rounded-lg border px-4 py-3 text-center text-sm">
              {error}
            </p>
          ) : src ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={src}
              alt={photo.name}
              onClick={() => setZoomed((z) => !z)}
              /*
                Phóng to KHÔNG chặn theo px như PhotoView. Ảnh ở đây là bản gốc,
                nên để nó tự trải theo đúng số điểm ảnh nó có: `max-w-none` cộng
                `w-auto` cho ảnh hiện ở tỉ lệ 1:1, kéo trong vùng cuộn mà xem.

                Bóng đổ thay cho việc trước đây nền tối tự tách ảnh khỏi nền: trên
                nền sáng, ảnh nền sáng sẽ chảy lẫn vào nền nếu không có ranh giới.
              */
              className={
                zoomed
                  ? "h-auto w-auto max-w-none cursor-zoom-out rounded-lg shadow-lg"
                  : "max-h-[calc(100dvh-13rem)] max-w-[calc(100vw-2rem)] cursor-zoom-in rounded-lg object-contain shadow-lg"
              }
            />
          ) : (
            // Ảnh gốc vài MB nên chờ là chuyện thường — hiện thumb đã có sẵn làm
            // nền mờ, thay vì một khoảng trống không biết đang chờ cái gì.
            <div className="relative">
              {photo.thumb && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={photo.thumb}
                  alt=""
                  aria-hidden="true"
                  className="max-h-[50dvh] max-w-[calc(100vw-2rem)] rounded-lg opacity-50 blur-sm"
                />
              )}
              <span className="absolute inset-0 flex items-center justify-center">
                <LoadingMark size={48} />
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Thanh dưới cùng. Bấm vào đây không được đóng viewer, nên chặn nổi bọt —
          thẻ bọc ngoài đang nghe click để đóng. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="border-hairline flex shrink-0 items-center justify-end gap-3 border-t px-5 pt-3 pb-4"
      >
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={busy}
            className="text-danger-text hover:bg-outflow/8 rounded-xl px-3.5 py-2 text-sm font-medium transition active:scale-95 disabled:opacity-40"
          >
            Xoá ảnh
          </button>
          <button
            type="button"
            onClick={() => void save()}
            // Chưa tải xong bản gốc thì chưa có gì để lưu.
            // Khoá theo `blob` chứ không theo `src`: đó mới là thứ save() cần —
            // đường Web Share dựng File từ Blob, còn src chỉ dùng ở cách dự phòng.
            disabled={!blob || busy}
            className="bg-brand rounded-xl px-4 py-2 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-40"
          >
            Lưu
          </button>
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Xoá ảnh này?"
          message={`"${photo.name}" sẽ bị xoá, không lấy lại được.`}
          busy={busy}
          onConfirm={() => void remove()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>,
    document.body,
  );
}
