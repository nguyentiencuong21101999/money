import { NextResponse } from "next/server";
import { callerOf } from "@/lib/api-auth";
import {
  createUploadSession,
  DriveError,
  driveConfig,
  fileInfo,
  FOLDER_MIME,
  safeDriveName,
} from "@/lib/drive";

export const runtime = "nodejs";

/**
 * Xin giấy phép upload một tấm ảnh lên Drive.
 *
 * Route này KHÔNG nhận bytes ảnh — nó chỉ trả về một URL để trình duyệt tự đẩy
 * bytes thẳng lên Google. Lý do ở createUploadSession(): Vercel chặn body ở
 * 4,5MB, mà ảnh gốc từ camera thường vượt ngưỡng đó.
 *
 * Đổi lại, giấy phép này phải được cấp có kiểm soát — người lạ gọi được là họ
 * ghi rác vào Drive của chủ app. Nên bắt buộc đăng nhập, và uid của người gọi
 * được đóng vào appProperties của file để route đọc ảnh sau này biết ai là chủ.
 */

/**
 * Trần một tấm ảnh. Không phải giới hạn của Drive (Drive cho tới 5TB) mà là
 * chặn ngu ngốc: ảnh điện thoại nét nhất cũng chỉ quanh 10MB, cái gì 25MB trở
 * lên thì gần như chắc chắn là chọn nhầm file — thà báo lỗi ngay còn hơn để
 * người dùng chờ hết một lượt upload dài rồi mới biết.
 */
const MAX_BYTES = 25 * 1024 * 1024;

interface Body {
  name?: string;
  mimeType?: string;
  size?: number;
  /** Thư mục album đích. Bỏ trống thì ảnh rơi vào thư mục gốc. */
  parentFolderId?: string;
}

export async function POST(request: Request) {
  try {
    // Xác thực TRƯỚC khi soi cấu hình. Ngược lại thì người chưa đăng nhập cũng
    // đọc được thông điệp "chưa cấu hình Drive" — kể chuyện về hạ tầng của mình
    // cho người lạ, mà chẳng để làm gì.
    const caller = await callerOf(request);
    if (!caller) return fail(401, "Cần đăng nhập mới lưu được ảnh.");

    const config = driveConfig();
    if (!config) {
      return fail(
        503,
        "Chưa cấu hình Google Drive. Chạy `npm run drive-auth` rồi dán 4 biến GOOGLE_DRIVE_* vào .env.local.",
      );
    }

    let body: Body;
    try {
      body = await request.json();
    } catch {
      return fail(400, "Dữ liệu gửi lên không hợp lệ.");
    }

    const mimeType = body.mimeType?.trim() ?? "";
    const size = Number(body.size);

    if (!mimeType.startsWith("image/")) return fail(400, "Chỉ nhận tệp ảnh.");
    if (!Number.isFinite(size) || size <= 0) return fail(400, "Thiếu kích thước ảnh.");
    if (size > MAX_BYTES) {
      return fail(
        413,
        `Ảnh lớn hơn ${Math.round(MAX_BYTES / 1024 / 1024)}MB. Chọn ảnh khác nhé.`,
      );
    }

    /*
      Thư mục đích PHẢI được kiểm, không được tin.

      parentFolderId đến từ trình duyệt, nên nếu truyền thẳng xuống Drive thì bất
      kỳ ai đăng nhập cũng đẩy được ảnh vào thư mục album của NGƯỜI KHÁC — chỉ cần
      đoán ra id. Ảnh đó vẫn mang ownerUid của họ nên nạn nhân không xem được,
      nhưng nó nằm trong thư mục của nạn nhân và ăn dung lượng, mà app thì không
      thấy để dọn.

      Chốt bằng cùng một cái neo với ảnh: appProperties.ownerUid của thư mục, do
      /api/albums ghi lúc tạo. Sai chủ hoặc không phải thư mục thì 404, không 403 —
      403 là vô tình xác nhận id này có thật.
    */
    const parentFolderId = body.parentFolderId?.trim();
    if (parentFolderId) {
      const folder = await fileInfo(config, parentFolderId);
      if (
        !folder ||
        folder.ownerUid !== caller.uid ||
        folder.mimeType !== FOLDER_MIME
      ) {
        return fail(404, "Không tìm thấy album này.");
      }
    }

    const uploadUrl = await createUploadSession(config, {
      name: fileName(body.name, mimeType),
      mimeType,
      sizeBytes: size,
      ownerUid: caller.uid,
      parentId: parentFolderId ?? null,
      // Chuyển tiếp Origin để Google mở CORS cho cú PUT của trình duyệt.
      // Thiếu nó thì bytes bị chặn ngay ở lớp CORS.
      origin: request.headers.get("origin"),
    });

    return NextResponse.json({ uploadUrl });
  } catch (error) {
    if (error instanceof DriveError) return fail(error.status, error.message);
    console.error("[images/session]", error);
    return fail(500, "Không tạo được phiên upload.");
  }
}

/**
 * Tên file gửi lên Drive. Trống thì tự đặt theo thời điểm — file không tên trong
 * Drive là thứ không ai tìm lại được.
 */
function fileName(raw: string | undefined, mimeType: string): string {
  const cleaned = safeDriveName(raw);
  if (cleaned) return cleaned;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "jpg";
  return `anh-${stamp}.${ext}`;
}

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}
