import { NextResponse } from "next/server";
import { callerOf } from "@/lib/api-auth";
import { deleteFile, DriveError, driveConfig, fileInfo, fileStream } from "@/lib/drive";

export const runtime = "nodejs";
/**
 * Function sống suốt thời gian bytes còn chảy về máy người dùng, nên hạn này
 * tính theo ĐƯỜNG TRUYỀN CỦA NGƯỜI XEM chứ không theo thời gian xử lý.
 *
 * Ảnh gốc tới 25MB, tải qua 4G chậm là vài chục giây. Để mặc định (Hobby ~10s)
 * thì ảnh nặng bị cắt giữa dòng, và triệu chứng rất khó lần: ảnh nhỏ xem tốt,
 * ảnh to thì thỉnh thoảng lỗi, tuỳ mạng người xem.
 */
export const maxDuration = 60;

/**
 * Đọc và xoá một tấm ảnh gốc trên Drive.
 *
 * VÌ SAO PHẢI ĐI QUA SERVER
 * File trên Drive KHÔNG có URL công khai, và ảnh riêng tư thì không nên có.
 * Muốn tải bytes phải kèm access token của chủ app — token đó tuyệt đối không
 * được lộ ra trình duyệt, nên server đứng giữa làm người chuyển thư.
 *
 * PHÂN QUYỀN NEO VÀO ĐÂU
 * Ở appProperties.ownerUid của chính file Drive, do route session ghi lúc tạo.
 * Nhờ vậy chỗ này kiểm được chủ sở hữu mà KHÔNG cần đọc Firestore, tức không
 * cần service account. Nếu tin vào driveFileId do client gửi kèm mà không kiểm,
 * thì bất kỳ ai đăng nhập cũng dò được ảnh của người khác.
 */

/** Bytes của một file Drive không bao giờ đổi, nên cho cache thoải mái. */
const CACHE = "private, max-age=31536000, immutable";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const gate = await authorize(request, (await params).id);
    if ("error" in gate) return gate.error;

    const upstream = await fileStream(gate.config, gate.file.id);

    // Chuyển tiếp thẳng dòng bytes, KHÔNG đọc hết vào RAM: ảnh gốc 8MB nhân vài
    // request song song là đủ làm hàm serverless hết bộ nhớ.
    const headers = new Headers({
      "Content-Type": gate.file.mimeType,
      "Cache-Control": CACHE,
      // Ảnh hiện trong trang, không phải file tải về.
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(gate.file.name)}`,
    });
    const length = upstream.headers.get("content-length");
    if (length) headers.set("Content-Length", length);

    return new NextResponse(upstream.body, { headers });
  } catch (error) {
    return explode("images/get", error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const gate = await authorize(request, (await params).id);
    if ("error" in gate) return gate.error;

    await deleteFile(gate.config, gate.file.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return explode("images/delete", error);
  }
}

/**
 * Cửa chung cho cả hai method: có cấu hình, có đăng nhập, và file này đúng là
 * của người đang gọi.
 */
async function authorize(request: Request, id: string) {
  // Đăng nhập trước, cấu hình sau — đừng kể trạng thái hạ tầng cho người lạ.
  const caller = await callerOf(request);
  if (!caller) return { error: fail(401, "Cần đăng nhập.") } as const;

  const config = driveConfig();
  if (!config) {
    return { error: fail(503, "Chưa cấu hình Google Drive trên máy chủ.") } as const;
  }

  const fileId = id?.trim();
  if (!fileId) return { error: fail(400, "Thiếu mã ảnh.") } as const;

  const file = await fileInfo(config, fileId);

  /*
    Không phải chủ thì trả 404 y như khi file không tồn tại — CỐ Ý.

    Trả 403 là vô tình xác nhận "mã này có thật, chỉ không phải của bạn", đủ để
    người ta dò xem chủ app có những ảnh nào. 404 thì hai trường hợp trông giống
    nhau và không nói lên điều gì.
  */
  if (!file || file.ownerUid !== caller.uid) {
    return { error: fail(404, "Không tìm thấy ảnh này.") } as const;
  }

  return { config, file } as const;
}

function explode(tag: string, error: unknown) {
  if (error instanceof DriveError) return fail(error.status, error.message);
  console.error(`[${tag}]`, error);
  return fail(500, "Lỗi máy chủ khi xử lý ảnh.");
}

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}
