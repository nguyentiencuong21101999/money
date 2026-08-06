import { NextResponse } from "next/server";
import { callerOf } from "@/lib/api-auth";
import {
  deleteFile,
  DriveError,
  driveConfig,
  fileInfo,
  FOLDER_MIME,
  renameFile,
  safeDriveName,
} from "@/lib/drive";

export const runtime = "nodejs";

/**
 * Đổi tên và xoá thư mục album trên Drive.
 *
 * `id` ở đây là driveFolderId, không phải id document Firestore — route này chỉ
 * nói chuyện với Drive, còn document thì trình duyệt tự ghi qua rules.
 */

type Context = { params: Promise<{ id: string }> };

/** Đổi tên album: Firestore do client sửa, thư mục Drive do đây sửa. */
export async function PATCH(request: Request, { params }: Context) {
  try {
    const gate = await authorize(request, (await params).id);
    if ("error" in gate) return gate.error;

    let body: { name?: string };
    try {
      body = await request.json();
    } catch {
      return fail(400, "Dữ liệu gửi lên không hợp lệ.");
    }

    const name = safeDriveName(body.name);
    if (!name) return fail(400, "Album phải có tên.");

    await renameFile(gate.config, gate.folder.id, name);
    return NextResponse.json({ name });
  } catch (error) {
    return explode("albums/rename", error);
  }
}

/**
 * Xoá album.
 *
 * Xoá thư mục trên Drive là xoá luôn MỌI ẢNH bên trong — Drive không đòi thư mục
 * phải rỗng. Nên client phải hỏi lại người dùng trước khi gọi, và phải xoá các
 * document ảnh trong Firestore sau khi đây trả về, không thì thư viện còn lại
 * một đống ô ảnh trỏ vào hư không.
 */
export async function DELETE(request: Request, { params }: Context) {
  try {
    const gate = await authorize(request, (await params).id);
    if ("error" in gate) return gate.error;

    await deleteFile(gate.config, gate.folder.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return explode("albums/delete", error);
  }
}

/**
 * Kiểm: có đăng nhập, có cấu hình, id này là THƯ MỤC, và thư mục đó của người
 * đang gọi.
 *
 * Kiểm cả mimeType là cố ý. Không kiểm thì route này thành một cách xoá/đổi tên
 * bất kỳ FILE ẢNH nào của chính mình mà bỏ qua toàn bộ luồng ảnh — không nguy
 * hiểm cho người khác, nhưng là một cửa sau âm thầm làm lệch dữ liệu.
 */
async function authorize(request: Request, id: string) {
  const caller = await callerOf(request);
  if (!caller) return { error: fail(401, "Cần đăng nhập.") } as const;

  const config = driveConfig();
  if (!config) {
    return { error: fail(503, "Chưa cấu hình Google Drive trên máy chủ.") } as const;
  }

  const folderId = id?.trim();
  if (!folderId) return { error: fail(400, "Thiếu mã album.") } as const;

  const folder = await fileInfo(config, folderId);

  // Không phải chủ, hoặc không phải thư mục → 404 y như khi không tồn tại.
  // Trả 403 là vô tình xác nhận mã này có thật.
  if (!folder || folder.ownerUid !== caller.uid || folder.mimeType !== FOLDER_MIME) {
    return { error: fail(404, "Không tìm thấy album này.") } as const;
  }

  return { config, folder } as const;
}

function explode(tag: string, error: unknown) {
  if (error instanceof DriveError) return fail(error.status, error.message);
  console.error(`[${tag}]`, error);
  return fail(500, "Lỗi máy chủ khi xử lý album.");
}

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}
