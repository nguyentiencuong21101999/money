"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { deleteAlbum, initialsOf, useAlbums, type Album } from "@/lib/albums";
import { useAuth } from "@/lib/auth";
import { ConfirmDialog } from "./ConfirmDialog";
import { LoadingMark } from "./LoadingMark";
import { HOME_CRUMB, PageHeader } from "./PageHeader";
import { AlbumDialog } from "./AlbumDialog";

/**
 * Danh sách album — trang gốc của thư viện ảnh.
 *
 * CỐ Ý không tải ảnh ở đây, chỉ tải document album. Mỗi ảnh mang một thumb
 * ~10KB, nên đếm số ảnh bằng cách tải chúng về đồng nghĩa với kéo cả thư viện —
 * vài MB chỉ để hiện một con số. Con số đó đọc từ `photoCount` trong chính
 * document album, được cập nhật nguyên tử cùng mỗi lần thêm/xoá ảnh.
 */
export function AlbumLibrary() {
  const { user } = useAuth();
  const router = useRouter();
  const { data: albums, loading, error } = useAlbums(user?.uid);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Album | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Album đang chờ xác nhận xoá. null = không có popup nào mở. */
  const [pending, setPending] = useState<Album | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [idToken, setIdToken] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    void user.getIdToken().then((t) => {
      if (alive) setIdToken(t);
    });
    return () => {
      alive = false;
    };
  }, [user]);

  async function remove(album: Album) {
    if (!user || !idToken || deleting) return;

    setDeleting(true);
    setActionError(null);
    try {
      await deleteAlbum(user.uid, album, idToken);
      setPending(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-4 pb-16">
      <PageHeader title="Thư viện ảnh" trail={[HOME_CRUMB]} />

      {(error || actionError) && (
        <p className="border-critical/40 bg-critical/6 text-critical mt-4 rounded-lg border px-3 py-2 text-sm">
          {actionError ?? error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingMark />
        </div>
      ) : (
        // Ô "Tạo album" là ô ĐẦU của lưới, không phải nút riêng trên đầu trang.
        // Nhờ vậy thư viện rỗng không cần màn hình trống riêng: lưới lúc đó chỉ
        // có đúng ô này, và nó đã tự nói phải làm gì.
        <ul className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
          <li>
            <button
              type="button"
              onClick={() => setCreating(true)}
              disabled={!idToken}
              className="block w-full text-left disabled:opacity-40"
            >
              {/* hover đặt trên chính ô vuông, không dùng group-hover: rê chuột
                  qua chữ "Tạo album" thì ô vuông không phải sáng lên theo. */}
              <span className="frame-ramp bg-expense/6 hover:bg-expense/12 flex aspect-square items-center justify-center rounded-2xl transition active:scale-[0.98]">
                <span
                  aria-hidden="true"
                  className="text-expense text-3xl leading-none font-light"
                >
                  +
                </span>
              </span>
              <span className="text-ink-2 mt-1.5 block truncate px-0.5 text-sm font-medium">
                Tạo album
              </span>
            </button>
          </li>

          {albums.map((album) => (
            <li key={album.id}>
              <AlbumCard
                album={album}
                onEdit={() => setEditing(album)}
                onDelete={() => setPending(album)}
              />
            </li>
          ))}
        </ul>
      )}

      {pending && (
        <ConfirmDialog
          title={`Xoá album "${pending.name}"?`}
          message={
            (pending.photoCount ?? 0) > 0
              ? `Toàn bộ ${pending.photoCount} ảnh trong album sẽ bị xoá, không lấy lại được.`
              : "Album này chưa có ảnh nào."
          }
          confirmLabel="Xoá album"
          busy={deleting}
          onConfirm={() => void remove(pending)}
          onCancel={() => setPending(null)}
        />
      )}

      {creating && user && idToken && (
        <AlbumDialog
          uid={user.uid}
          idToken={idToken}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            // Vào thẳng album vừa tạo — việc tiếp theo người ta muốn làm chắc
            // chắn là thêm ảnh vào đó, không phải ngắm lưới album.
            router.push(`/images/${id}`);
          }}
        />
      )}

      {editing && user && idToken && (
        <AlbumDialog
          uid={user.uid}
          idToken={idToken}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}

interface CardProps {
  album: Album;
  onEdit: () => void;
  onDelete: () => void;
}

function AlbumCard({ album, onEdit, onDelete }: CardProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Đóng menu khi bấm ra ngoài hoặc bấm Esc. Nghe ở mousedown chứ không click:
  // click nổ sau khi thẻ Link đã kịp nhận cú bấm, menu sẽ đóng muộn một nhịp.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const count = album.photoCount ?? 0;

  return (
    <div className="relative" ref={root}>
      {/*
        Link KHÔNG mang .liftable.

        .liftable:hover đặt cả background, box-shadow và transform, nên để nó ở
        đây là vành sáng cùng khối bóng bọc trọn cả tên và số ảnh — thành một cái
        khung quanh toàn bộ thẻ, không phải quanh cái hình.

        Cũng không chuyển .liftable xuống ô ảnh được: `background` là shorthand,
        nó sẽ xoá luôn background-image của bg-brand mỗi lần hover và bìa album
        mất màu. Ô ảnh dùng .frame-ramp, thứ vốn đã có luật :hover::before làm
        vành đậm lên — hover đúng phạm vi cái hình, không cần thêm gì.
      */}
      <Link href={`/images/${album.id}`} className="block">
        <div
          className={`frame-ramp aspect-square overflow-hidden rounded-2xl transition active:scale-[0.98] ${
            album.logo ? "" : "bg-brand"
          }`}
        >
          {album.logo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={album.logo}
              alt=""
              loading="lazy"
              className="block h-full w-full object-cover"
            />
          ) : (
            // Không có logo: chữ đầu của tên trên bg-brand — đúng dải màu của
            // nút chính và logo app, xem ghi chú trong albums.ts.
            <span className="flex h-full w-full items-center justify-center text-2xl font-semibold text-white">
              {initialsOf(album.name)}
            </span>
          )}
        </div>
        <p className="text-ink-2 mt-1.5 truncate px-0.5 text-sm font-medium">
          {album.name}
        </p>
        <p className="text-muted px-0.5 text-xs">{count} ảnh</p>
      </Link>

      {/*
        Nút ⋯ nằm NGOÀI thẻ Link, không lồng trong nó: <button> bên trong <a> là
        HTML sai, và cú bấm sẽ vừa mở menu vừa điều hướng sang trang album.
        Đặt tuyệt đối lên góc bìa nên nhìn vẫn như nằm trên thẻ.
      */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Tuỳ chọn cho ${album.name}`}
        className="bg-brand absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full text-white shadow-sm transition active:scale-90"
      >
        <span aria-hidden="true" className="text-sm leading-none">
          ⋯
        </span>
      </button>

      {open && (
        <div
          role="menu"
          /* top-9 = ngay dưới nút ⋯ (top-1 + h-7). Neo về bên phải và mở sang
             trái nên ô ở cột cuối cũng không tràn ra ngoài màn hình. */
          className="card overlay-surface animate-drop border-expense/25 absolute top-9 right-1 z-40 w-36 origin-top-right overflow-hidden p-0 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            /* Dùng đúng cặp token của tiền vào / tiền ra (xem TxList): sửa là
               việc lành nên lấy màu số cộng, xoá là việc mất mát nên lấy màu số
               trừ. Không tự đặt màu mới — hai màu này đã là quy ước của app.
               text-success-text = --color-income (tím). */
            className="text-success-text hover:bg-income/8 block w-full px-4 py-2.5 text-left text-sm font-medium transition"
          >
            Sửa album
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            /* text-danger-text = #9d174d (hồng), bg-outflow trỏ cùng mã màu đó. */
            className="text-danger-text hover:bg-outflow/8 border-hairline block w-full border-t px-4 py-2.5 text-left text-sm font-medium transition"
          >
            Xoá album
          </button>
        </div>
      )}
    </div>
  );
}
