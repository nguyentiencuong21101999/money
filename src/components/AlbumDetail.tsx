"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAlbum } from "@/lib/albums";
import { useAuth } from "@/lib/auth";
import {
  deletePhoto,
  formatBytes,
  SORT_LABELS,
  sortPhotos,
  uploadPhoto,
  usePhotos,
  type Photo,
  type SortKey,
} from "@/lib/photos";
import { ConfirmDialog } from "./ConfirmDialog";
import { LoadingMark } from "./LoadingMark";
import { HEADER_BUTTON, HOME_CRUMB, PageHeader } from "./PageHeader";
import { PhotoViewer } from "./PhotoViewer";

/** Một ảnh đang trong hàng đợi upload. */
interface Pending {
  /** Khoá cho React. Tên file trùng nhau được, nên không dùng tên làm khoá. */
  key: number;
  name: string;
  /** blob URL của chính file đang đẩy — dùng làm hình xem trước tại chỗ. */
  previewUrl: string;
  /** 0..1 */
  ratio: number;
}

/** Một ảnh đã đẩy thất bại. */
interface Failure {
  key: number;
  name: string;
  message: string;
}

let nextKey = 1;

/**
 * Trần số ảnh mỗi lượt.
 *
 * Không phải giới hạn kỹ thuật — upload tuần tự nên 100 ảnh vẫn chạy được, chỉ
 * lâu. Đây là chặn để một cú chọn-tất-cả trong thư viện ảnh điện thoại không biến
 * thành hàng đợi nửa tiếng mà người dùng không kịp nhận ra mình đã bấm gì.
 */
const MAX_BATCH = 10;

/** Đường dẫn tới trang này: Sổ tiền › Thư viện ảnh › (tên album). */
const PHOTO_TRAIL = [HOME_CRUMB, { label: "Thư viện ảnh", href: "/images" }];

export function AlbumDetail({ albumId }: { albumId: string }) {
  const { user } = useAuth();
  const album = useAlbum(user?.uid, albumId);
  const { data: photos, loading: loadingPhotos, error } = usePhotos(user?.uid, albumId);

  /**
   * Có nên che lưới bằng logo chờ hay không.
   *
   * usePhotos coi "rỗng mà từ cache" là CHƯA chốt, vì cache không phân biệt được
   * "album rỗng thật" với "chưa tải về". Đúng cho album có ảnh, nhưng với album
   * rỗng thì nó phải đợi snapshot từ server — tức đợi Firestore bắt xong kết nối,
   * trên điện thoại sau khi tải lại trang là vài giây ngồi nhìn logo thở cho một
   * album chẳng có gì.
   *
   * photoCount trong document album trả lời được ngay: nó cập nhật nguyên tử cùng
   * mỗi lần thêm/xoá ảnh, và document album đã nằm trong cache từ lúc xem lưới
   * album. Biết trước là 0 thì khỏi chờ gì cả.
   *
   * Vẫn chờ khi album.loading: lúc đó chưa biết photoCount, mà useAlbum chốt ngay
   * ở snapshot đầu (kể cả từ cache) nên quãng này rất ngắn.
   */
  const loading = loadingPhotos && (album.loading || (album.data?.photoCount ?? 0) > 0);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Điều khiển huỷ lượt đẩy đang chạy. null = không có lượt nào. */
  const abortRef = useRef<AbortController | null>(null);

  const [sort, setSort] = useState<SortKey>("newest");
  const [queue, setQueue] = useState<Pending[]>([]);
  const [failed, setFailed] = useState<Failure[]>([]);
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);

  /** Chế độ chọn nhiều ảnh để xoá một lượt. */
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  /**
   * Việc xoá đang chờ xác nhận. null = không có popup nào mở.
   *
   * Gộp cả hai luồng (một tấm bằng dấu ×, nhiều tấm bằng nút Xoá) vào một state
   * thay vì hai cờ riêng: hai cờ thì có trạng thái vô nghĩa là cả hai cùng bật,
   * và phải tự nhớ tắt cái kia mỗi lần bật cái này.
   */
  const [pending, setPending] = useState<Photo[] | null>(null);

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

  const shown = useMemo(() => sortPhotos(photos, sort), [photos, sort]);

  /**
   * Tập đã chọn, đã bỏ những ảnh không còn tồn tại.
   *
   * Xoá xong thì onSnapshot bắn danh sách mới, nhưng `selected` vẫn giữ id cũ.
   * Không lọc thì bộ đếm "Đã chọn 3" đứng mãi ở 3 dù ảnh đã biến mất.
   *
   * DẪN XUẤT chứ không đồng bộ `selected` bằng useEffect: gọi setState trong
   * effect tạo thêm một lượt render với dữ liệu cũ trước khi sửa lại, và eslint
   * chặn đúng chỗ đó (react-hooks/set-state-in-effect). Id chết còn nằm trong
   * `selected` cũng vô hại vì không chỗ nào đọc trực tiếp nó.
   */
  const checked = useMemo(() => {
    const alive = new Set(photos.map((p) => p.id));
    return new Set([...selected].filter((id) => alive.has(id)));
  }, [photos, selected]);

  /**
   * Upload lần lượt từng ảnh, không song song.
   *
   * Chọn 10 ảnh rồi đẩy cùng lúc thì đường lên của điện thoại bị chia mười, mọi
   * thanh tiến trình bò như nhau và tấm đầu tiên xong cũng chậm y như tấm cuối.
   * Lần lượt thì thấy xong dần từng tấm, và mạng rớt giữa đường cũng chỉ mất
   * một tấm đang dở.
   */
  async function upload(files: File[]) {
    const target = album.data;
    if (!user || !target) return;

    const picked = files.filter((f) => f.type.startsWith("image/"));
    if (picked.length === 0) return;

    const batch = picked.slice(0, MAX_BATCH);
    const dropped = picked.length - batch.length;
    // Nói thẳng số ảnh bị bỏ. Im lặng cắt bớt là tệ nhất: người dùng tưởng đã đẩy
    // hết 30 tấm, mãi sau mới phát hiện thiếu 20.
    setActionError(
      dropped > 0
        ? `Mỗi lượt chỉ nhận ${MAX_BATCH} ảnh. Đã bỏ qua ${dropped} ảnh cuối — chọn lại lượt sau nhé.`
        : null,
    );
    setFailed([]);

    // Token lấy MỘT lần cho cả lô: getIdToken() tự làm mới khi cần, và token
    // sống một giờ nên đủ cho một lượt upload dài.
    const token = await user.getIdToken();
    setIdToken(token);

    const controller = new AbortController();
    abortRef.current = controller;

    const entries = batch.map((file) => ({
      key: nextKey++,
      file,
      name: file.name,
      previewUrl: URL.createObjectURL(file),
    }));

    // Đưa cả lô vào hàng đợi ngay, không thêm dần từng tấm: ô xem trước cần biết
    // còn bao nhiêu tấm nữa để hiện số, và thứ tự phải cố định từ đầu.
    setQueue((q) => [
      ...q,
      ...entries.map(({ key, name, previewUrl }) => ({ key, name, previewUrl, ratio: 0 })),
    ]);

    try {
      for (const entry of entries) {
        // Huỷ giữa lô thì dừng ngay, những tấm chưa tới lượt không đẩy nữa.
        if (controller.signal.aborted) break;
        try {
          await uploadPhoto(entry.file, {
            uid: user.uid,
            idToken: token,
            albumId: target.id,
            parentFolderId: target.driveFolderId,
            signal: controller.signal,
            onProgress: (ratio) =>
              setQueue((q) => q.map((p) => (p.key === entry.key ? { ...p, ratio } : p))),
          });
        } catch (e) {
          // Người dùng tự huỷ thì không phải lỗi, đừng báo đỏ.
          if (controller.signal.aborted) break;
          // Không dừng cả lô vì một tấm hỏng — gom lại báo ở cuối. Dừng lại thì
          // mạng chớp một nhịp là mất luôn chín tấm còn lại.
          const message = e instanceof Error ? e.message : String(e);
          console.error("[photos] upload thất bại", entry.name, e);
          setFailed((f) => [...f, { key: entry.key, name: entry.name, message }]);
        }
        // Rời hàng đợi bất kể thành công hay không, để tấm kế tiếp lên làm ảnh
        // xem trước. Ảnh đã lên thì đã hiện trong lưới qua onSnapshot.
        setQueue((q) => q.filter((p) => p.key !== entry.key));
      }
    } finally {
      /*
        Thu hồi blob URL sau khi XONG CẢ LÔ, không thu hồi từng tấm.

        Thu hồi ngay khi một tấm xong thì thẻ <img> vẫn còn trỏ vào URL đã chết
        cho tới lượt render kế tiếp, và ảnh nháy trống một khung hình. Giữ tới
        cuối lô không tốn thêm bộ nhớ đáng kể: createObjectURL không nhân bản
        bytes, các File đó vốn đã nằm trong RAM.
      */
      for (const entry of entries) URL.revokeObjectURL(entry.previewUrl);
      abortRef.current = null;
      // Huỷ giữa lô để lại các tấm chưa đẩy trong hàng đợi — dọn sạch.
      setQueue((q) => q.filter((p) => !entries.some((e) => e.key === p.key)));
    }
  }

  /** Huỷ cả lô đang đẩy. Tấm đang dở bị abort, các tấm sau không đẩy nữa. */
  function cancelUpload() {
    abortRef.current?.abort();
  }

  // Dán ảnh từ clipboard. Không đặt dependency array: handler đọc state mới nhất
  // ở mỗi lần render, giống cách UploadScan làm.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length === 0) return;
      e.preventDefault();
      void upload(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * Xoá đúng danh sách được đưa vào, lần lượt từng tấm.
   *
   * Đếm riêng số tấm thất bại chứ không dừng ở tấm đầu tiên hỏng: xoá 20 ảnh mà
   * tấm thứ 3 lỗi mạng thì 17 tấm còn lại vẫn nên xoá được. Báo lại đúng những
   * tấm không xoá nổi, đừng nói suông là "xong".
   */
  async function removePhotos(targets: Photo[]) {
    if (!user || !idToken || targets.length === 0 || deleting) return;

    setDeleting(true);
    setActionError(null);
    const failed: string[] = [];

    for (const photo of targets) {
      try {
        await deletePhoto(user.uid, photo, idToken);
      } catch (e) {
        console.error("[photos] xoá thất bại", photo.name, e);
        failed.push(photo.name);
      }
    }

    setDeleting(false);
    setPending(null);

    if (failed.length === 0) {
      setSelecting(false);
      setSelected(new Set());
    } else {
      setActionError(
        `Không xoá được ${failed.length}/${targets.length} ảnh: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}`,
      );
    }
  }

  function exitSelect() {
    setSelecting(false);
    setSelected(new Set());
  }

  // Album không tồn tại — vào bằng link cũ, hoặc vừa xoá ở tab khác.
  if (!album.loading && !album.data) {
    return (
      <main className="mx-auto max-w-3xl p-4">
        <PageHeader title="Không tìm thấy album" trail={PHOTO_TRAIL} />
        <p className="text-muted mt-6 text-center text-sm">
          {album.error ?? "Album này không còn tồn tại."}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-4 pb-16">
      <PageHeader title={album.data?.name ?? "Đang tải…"} trail={PHOTO_TRAIL}>
        {/* Sửa / Xoá album không còn ở đây — chúng nằm ở menu ⋯ của thẻ album
            ngoài thư viện, chỗ nhìn thấy được album mà không phải mở nó ra. */}
        {selecting ? (
          <>
            <span className="text-muted text-xs whitespace-nowrap">
              Đã chọn {checked.size}
            </span>
            <button
              type="button"
              onClick={() => setPending(photos.filter((p) => checked.has(p.id)))}
              disabled={checked.size === 0 || deleting}
              className={`${HEADER_BUTTON} text-danger-text`}
            >
              {deleting ? "Đang xoá…" : "Xoá"}
            </button>
            <button
              type="button"
              onClick={exitSelect}
              disabled={deleting}
              className={HEADER_BUTTON}
            >
              Xong
            </button>
          </>
        ) : (
          <>
            {photos.length > 1 && <SortMenu value={sort} onChange={setSort} />}
            {photos.length > 0 && (
              <button
                type="button"
                onClick={() => setSelecting(true)}
                className={HEADER_BUTTON}
              >
                Chọn
              </button>
            )}
          </>
        )}
      </PageHeader>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void upload([...(e.target.files ?? [])]);
          // Xoá value để chọn lại đúng file vừa chọn vẫn kích hoạt onChange.
          e.target.value = "";
        }}
      />

      {/* Ảnh đẩy thất bại. Giữ lại tới lượt đẩy sau, vì đây là chỗ duy nhất
          người dùng biết tấm nào không lên được và vì sao. */}
      {failed.length > 0 && (
        <ul className="border-critical/40 bg-critical/6 mb-3 space-y-1 rounded-lg border px-3 py-2">
          {failed.map((item) => (
            <li key={item.key} className="text-critical text-xs">
              <span className="font-medium">{item.name}</span> — {item.message}
            </li>
          ))}
        </ul>
      )}

      {(error || actionError) && (
        <p className="border-critical/40 bg-critical/6 text-critical mb-3 rounded-lg border px-3 py-2 text-sm">
          {actionError ?? error}
        </p>
      )}

      {photos.length > 0 && (
        <p className="text-muted mb-2 text-xs">
          {photos.length} ảnh ·{" "}
          {formatBytes(photos.reduce((sum, p) => sum + (p.size ?? 0), 0))}
        </p>
      )}

      {loading ? (
        /*
          Chiếm hết phần màn hình còn lại rồi căn giữa, không phải py-10.

          py-10 đặt logo ngay dưới đầu trang, còn cả một màn hình trống bên dưới —
          nhìn như trang đã tải xong mà rỗng, chứ không như đang chờ.

          10rem trừ ra là phần đã bị chiếm: main p-4 (1rem trên), đầu trang gồm
          breadcrumb + hàng logo + mb-4 (~4rem), và pb-16 ở đáy (4rem).
        */
        <div className="flex min-h-[calc(100dvh-10rem)] items-center justify-center">
          <LoadingMark />
        </div>
      ) : (
        /* Vùng nhận thả bọc cả lưới, không phải một ô nhỏ — kéo ảnh vào đâu
           trong lưới cũng nhận được. */
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void upload([...e.dataTransfer.files]);
          }}
          className={`rounded-2xl transition ${
            dragging ? "bg-expense/10 ring-expense ring-2 ring-inset" : ""
          }`}
        >
          <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
            {/* Ô "Thêm ảnh" là ô ĐẦU của lưới, hệt ô "Tạo album" ngoài thư viện.
                Ẩn khi đang chọn: lúc đó mọi ô trong lưới đều là ảnh chọn được,
                một ô làm việc khác hẳn nằm lẫn vào là dễ bấm nhầm. */}
            {!selecting && (
              <li>
                {queue.length > 0 ? (
                  /*
                    Đang đẩy: chính ô này thành ảnh xem trước của tấm đang lên, với
                    vành viền chạy theo tiến trình. Xong tấm nào thì tấm đó rời hàng
                    đợi và hiện luôn trong lưới (onSnapshot), còn tấm kế tiếp lên
                    đứng chỗ này.
                  */
                  <div className="relative">
                    <div
                      className="aspect-square w-full rounded-2xl p-0.75"
                      /*
                        Vành tiến trình bằng conic-gradient: quét quanh tâm nên trên
                        một ô vuông nó chạy đúng theo viền. Dùng được vì lớp trong
                        có nền đục che kín phần giữa, chỉ còn 3px rìa lộ ra.
                        from -90deg để mốc 0% nằm ở đỉnh, không phải bên phải.
                      */
                      style={{
                        background: `conic-gradient(from -90deg, var(--color-expense) ${Math.round(
                          queue[0].ratio * 100,
                        )}%, var(--color-track) ${Math.round(queue[0].ratio * 100)}%)`,
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={queue[0].previewUrl}
                        alt={`Đang đẩy ${queue[0].name}`}
                        className="block h-full w-full rounded-[0.8rem] object-cover"
                      />
                    </div>

                    {/* Còn nhiều tấm thì phải nói còn bao nhiêu — mười tấm mà chỉ
                        thấy một ô đổi ảnh thì không biết bao giờ xong. */}
                    {queue.length > 1 && (
                      <span className="bg-brand absolute bottom-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm">
                        còn {queue.length}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={cancelUpload}
                      aria-label="Huỷ đẩy ảnh"
                      className="bg-brand absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full text-sm leading-none text-white shadow-sm transition active:scale-90"
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={!album.data}
                    /* Bỏ nhãn chữ đi thì dấu + là thứ duy nhất còn lại, mà nó
                       aria-hidden — nên tên cho trình đọc màn hình phải chuyển lên
                       đây, không thì nút này thành nút không tên. */
                    aria-label="Thêm ảnh vào album"
                    className="frame-ramp bg-expense/6 hover:bg-expense/12 flex aspect-square w-full items-center justify-center rounded-2xl transition active:scale-[0.98] disabled:opacity-40"
                  >
                    <span
                      aria-hidden="true"
                      className="text-expense text-3xl leading-none font-light"
                    >
                      +
                    </span>
                  </button>
                )}
              </li>
            )}

            {shown.map((photo) => (
              <li key={photo.id}>
                <PhotoTile
                  photo={photo}
                  selecting={selecting}
                  checked={checked.has(photo.id)}
                  busy={deleting}
                  onOpen={() => setViewing(photo)}
                  onToggle={() => toggle(photo.id)}
                  onRemove={() => setPending([photo])}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title={pending.length === 1 ? "Xoá ảnh này?" : `Xoá ${pending.length} ảnh?`}
          message={
            pending.length === 1
              ? `"${pending[0].name}" sẽ bị xoá, không lấy lại được.`
              : "Các ảnh này sẽ bị xoá, không lấy lại được."
          }
          busy={deleting}
          onConfirm={() => void removePhotos(pending)}
          onCancel={() => setPending(null)}
        />
      )}

      {viewing && user && idToken && (
        <PhotoViewer
          photo={viewing}
          uid={user.uid}
          idToken={idToken}
          onClose={() => setViewing(null)}
          onDeleted={() => setViewing(null)}
        />
      )}
    </main>
  );
}

/**
 * Ô chọn cách sắp xếp.
 *
 * KHÔNG dùng <select> native: trình duyệt vẽ danh sách bằng widget của hệ điều
 * hành, nên nó không theo giao diện app chút nào — trên macOS là hộp xám vuông
 * góc với dấu ✓ của hệ thống, đứng cạnh các chip bo tròn mặt kính thì lạc hẳn.
 *
 * Dựng lại theo đúng khuôn dropdown app đang dùng (UserMenu, MonthPicker,
 * NotificationBell): nút mở dạng chip + panel `card overlay-surface animate-drop`.
 * Logic đóng khi bấm ngoài lặp lại ở từng dropdown — đó là cách codebase này vẫn
 * làm, nên giữ cho giống chỗ khác thay vì tự dựng một lớp trừu tượng riêng.
 */
function SortMenu({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (next: SortKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

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

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Sắp xếp ảnh"
        // is-ringed giữ vành sáng suốt lúc panel mở, cả khi chuột đã rời đi.
        className={`${HEADER_BUTTON} flex items-center gap-1.5 ${open ? "is-ringed" : ""}`}
      >
        {SORT_LABELS[value]}
        <span
          aria-hidden="true"
          className={`text-muted text-[9px] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          ▼
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="card overlay-surface animate-drop border-expense/25 absolute top-full right-0 z-40 mt-2 w-36 origin-top-right overflow-hidden p-0 shadow-lg"
        >
          {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              onClick={() => {
                onChange(key);
                setOpen(false);
              }}
              className={`hover:bg-expense/8 flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm transition ${
                key === value ? "text-expense font-medium" : "text-ink-2"
              }`}
            >
              {/* Dấu ✓ luôn chiếm chỗ, chỉ ẩn hiện — không thì hai dòng lệch nhau
                  theo chiều ngang mỗi lần đổi lựa chọn. */}
              <span aria-hidden="true" className={key === value ? "" : "invisible"}>
                ✓
              </span>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface TileProps {
  photo: Photo;
  selecting: boolean;
  checked: boolean;
  busy: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onRemove: () => void;
}

function PhotoTile({
  photo,
  selecting,
  checked,
  busy,
  onOpen,
  onToggle,
  onRemove,
}: TileProps) {
  return (
    /* Thẻ bọc `relative` là bắt buộc: dấu ở góc phải là ANH EM của nút ảnh, không
       lồng vào trong. <button> trong <button> là HTML sai, và cú bấm sẽ vừa chọn
       vừa mở ảnh. Giống cách nút × của logo trong AlbumDialog. */
    <div className="relative">
      {/*
        Ô ảnh giữ NGUYÊN một việc ở cả hai chế độ: bấm là xem to.

        Trước đây bật chế độ chọn thì cả ô đổi vai thành nút chọn, kèm ảnh thu nhỏ
        và mờ đi. Như vậy là cùng một chỗ bấm cho ra hai kết quả khác nhau tuỳ
        trạng thái ẩn — muốn xem lại một tấm giữa lúc đang chọn thì phải thoát chế
        độ chọn, mất luôn những gì đã tích. Giờ chỉ cái dấu ở góc đổi từ × sang ✓.
      */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Xem ${photo.name}`}
        className="frame-ramp block w-full cursor-zoom-in overflow-hidden rounded-2xl transition active:scale-[0.98]"
      >
        {photo.thumb ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photo.thumb}
            alt={photo.note || photo.name}
            loading="lazy"
            className="block aspect-square w-full object-cover"
          />
        ) : (
          // Không tạo được thumb (hay gặp với HEIC trên Chrome) — ảnh gốc vẫn
          // nằm trên Drive và mở ra xem được bình thường.
          <span className="bg-expense/10 text-expense/70 flex aspect-square w-full items-center justify-center text-xs">
            Xem ảnh
          </span>
        )}
      </button>

      {/* Cùng một chỗ, cùng một cỡ, chỉ đổi ký hiệu và việc nó làm: × để xoá
          tấm này, ✓ để tích/bỏ tích khi đang chọn. */}
      <button
        type="button"
        onClick={selecting ? onToggle : onRemove}
        disabled={busy}
        aria-label={
          selecting
            ? `${checked ? "Bỏ chọn" : "Chọn"} ${photo.name}`
            : `Xoá ${photo.name}`
        }
        aria-pressed={selecting ? checked : undefined}
        className={`absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full text-sm leading-none shadow-sm transition active:scale-90 disabled:opacity-40 ${
          selecting && !checked
            ? // Chưa tích: mặt đục viền nhạt, để thấy có ô tích mà không tưởng
              // là đã tích rồi.
              "bg-surface text-muted border-hairline border"
            : "bg-brand text-white"
        }`}
      >
        <span aria-hidden="true">{selecting ? "✓" : "×"}</span>
      </button>
    </div>
  );
}
