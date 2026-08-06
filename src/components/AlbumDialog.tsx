"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  createAlbum,
  initialsOf,
  renameAlbum,
  setAlbumLogo,
  type Album,
} from "@/lib/albums";
import { makeThumbnail } from "@/lib/photo-thumb";

interface Props {
  uid: string;
  idToken: string;
  /** Có album = sửa, không có = tạo mới. */
  editing?: Album;
  onClose: () => void;
  /** Gọi sau khi tạo xong, kèm id album mới — dùng để mở thẳng vào album đó. */
  onCreated?: (id: string) => void;
}

/**
 * Popup tạo/sửa album: tên, logo (không bắt buộc).
 *
 * Không có logo thì bìa album vẽ bằng chữ viết tắt của tên (initialsOf) trên
 * `bg-brand` — đúng dải màu của nút chính và logo app. Ô xem trước ở đây dùng
 * hệt cách AlbumLibrary vẽ bìa, nên cái thấy trong popup y hệt cái hiện ngoài lưới.
 *
 * Bố cục và các class lấy nguyên theo SendNotice/TxSheet: cùng đầu trang có nút
 * ×, cùng kiểu label + .field, cùng cặp nút ở chân. Trước đây popup này tự đặt
 * lại padding/viền/nền cho ô nhập — trùng hết với .field, mà .field vốn đã là
 * một utility đầy đủ (viền gradient hai lớp nền, nền đục, padding, cỡ chữ).
 */
export function AlbumDialog({ uid, idToken, editing, onClose, onCreated }: Props) {
  const [name, setName] = useState(editing?.name ?? "");
  const [logo, setLogo] = useState(editing?.logo ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  async function pickLogo(file: File | null | undefined) {
    if (!file) return;
    setError(null);
    const thumb = await makeThumbnail(file);
    if (!thumb) {
      setError(
        "Không đọc được ảnh này. Thử JPG/PNG (ảnh HEIC của iPhone có thể không mở được trên Chrome).",
      );
      return;
    }
    setLogo(thumb.dataUrl);
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Album phải có tên.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (editing) {
        // Đổi tên gọi tới Drive, đổi logo thì không — tách hai lời gọi để đổi
        // riêng logo không phải chờ một vòng mạng tới Drive.
        if (trimmed !== editing.name) {
          await renameAlbum(uid, editing, idToken, trimmed);
        }
        if (logo !== editing.logo) {
          await setAlbumLogo(uid, editing.id, logo);
        }
        onClose();
      } else {
        const id = await createAlbum(uid, idToken, { name: trimmed, logo });
        onCreated?.(id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const preview = name.trim() || "Album";

  return createPortal(
    <div
      /*
        Căn GIỮA ở mọi cỡ, không phải bottom sheet như TxSheet/SendNotice.

        Hai cái kia là form dài nên trượt lên từ đáy là đúng: ngón tay ở gần đáy
        màn hình, và nội dung cao tới đâu thì sheet chiếm tới đó. Popup này chỉ có
        một ô nhập và hai nút — dán sát mép dưới thì để trống nguyên màn hình phía
        trên, trông như bị tụt xuống chứ không như một hộp thoại.

        Có p-5 vì đã căn giữa: bottom sheet trải hết chiều ngang nên không cần,
        còn hộp thoại giữa màn hình mà không chừa lề thì trên máy hẹp nó chạm hai
        mép.
      */
      className="animate-fade fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5 backdrop-blur-md"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* sheet-surface là bắt buộc, không phải trang trí: .card là kính TRONG,
          mà đây nằm trên lớp phủ tối nên mặt kính ăn màu tối và ra xám đục. */}
      <div className="card sheet-surface animate-pop max-h-[92dvh] w-full max-w-md overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 text-base font-semibold">
            {editing ? "Sửa album" : "Album mới"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="text-muted hover:bg-expense/8 hover:text-ink -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xl leading-none active:scale-90"
          >
            ×
          </button>
        </div>

        <div className="mt-4 flex items-start gap-3.5">
          {/*
            Bìa xem trước, bấm vào là chọn logo. Dải chữ ở đáy để việc "bấm được"
            hiện rõ ngay — ô vuông có chữ viết tắt mà không có gì khác thì trông
            như một hình trang trí, không ai nghĩ là nút.

            Không cần class `relative`: frame-ramp đã tự đặt position: relative.
          */}
          {/* Thẻ bọc `relative` là bắt buộc: nút × phải là ANH EM của nút bìa,
              không lồng vào trong. <button> trong <button> là HTML sai, và cú bấm
              sẽ vừa xoá logo vừa mở hộp chọn tệp. */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              aria-label={logo ? "Đổi logo album" : "Thêm logo cho album"}
              className={`frame-ramp block h-20 w-20 overflow-hidden rounded-2xl transition active:scale-95 ${
                logo ? "" : "bg-brand"
              }`}
            >
              {logo ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={logo} alt="" className="block h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-2xl font-semibold text-white">
                  {initialsOf(preview)}
                </span>
              )}
              <span className="bg-brand absolute inset-x-0 bottom-0 py-1 text-center text-[10px] font-medium text-white">
                {logo ? "Đổi logo" : "Thêm logo"}
              </span>
            </button>

            {logo && (
              <button
                type="button"
                onClick={() => setLogo("")}
                aria-label="Bỏ logo"
                /* Lệch âm để nút nằm hẳn ra mép, gối lên góc ô ảnh. Không bị
                   cắt vì thẻ bọc ngoài không có overflow-hidden — chỉ nút bìa
                   bên trong mới có, mà nút × là anh em của nó.

                   bg-brand = đúng dải màu của nút chính và logo app. Dùng được ở
                   đây vì nút nằm nửa ngoài mép, phần lớn đứng trên nền panel
                   chứ không trên ảnh. */
                className="bg-brand absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full text-sm leading-none text-white shadow-sm transition active:scale-90"
              >
                <span aria-hidden="true">×</span>
              </button>
            )}
          </div>

          <label className="block min-w-0 flex-1">
            <span className="text-ink-2 text-xs font-medium">Tên album</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) void save();
              }}
              maxLength={120}
              className="field mt-1"
            />
          </label>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void pickLogo(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {error && (
          <p className="border-critical/40 bg-critical/6 text-critical animate-rise mt-3 rounded-lg border px-3 py-2 text-sm">
            {error}
          </p>
        )}

        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="glass-chip ring-ramp text-ink-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-40"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !name.trim()}
            className="bg-brand flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition duration-200 active:scale-[0.98] disabled:opacity-40"
          >
            {busy ? "Đang lưu…" : editing ? "Lưu" : "Tạo album"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
