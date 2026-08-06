import { NextResponse } from "next/server";
import { callerOf } from "@/lib/api-auth";
import { DriveError, driveConfig, ensureFolder, safeDriveName } from "@/lib/drive";

export const runtime = "nodejs";

/**
 * Tạo thư mục cho một album trên Drive.
 *
 * Dựng cây theo đúng hình dạng dễ tìm khi mở Drive bằng tay:
 *
 *   Thư viện ảnh — Sổ tiền/     (GOOGLE_DRIVE_FOLDER_ID)
 *     └─ ban@gmail.com/         (một thư mục cho mỗi người dùng)
 *          └─ Tên album/
 *               └─ anh.jpg
 *
 * Thư mục email tách theo NGƯỜI, không phải theo album: mọi ảnh đều nằm trong
 * Drive của chủ app, nên không có lớp này thì album của hai người trùng tên sẽ
 * lẫn vào nhau ngay ở tầng thư mục.
 *
 * Route CHỈ tạo thư mục và trả id về. Việc ghi document album là của trình
 * duyệt, qua Firestore rules — giống cách ảnh đang làm, nhờ đó tính năng này
 * không cần service account.
 *
 * Gọi lại với cùng tên thì ensureFolder trả về đúng thư mục cũ, không sinh
 * trùng — nên bấm tạo hai lần không để lại rác.
 */
export async function POST(request: Request) {
  try {
    const caller = await callerOf(request);
    if (!caller) return fail(401, "Cần đăng nhập mới tạo được album.");

    const config = driveConfig();
    if (!config) {
      return fail(
        503,
        "Chưa cấu hình Google Drive. Chạy `npm run drive-auth` rồi dán 4 biến GOOGLE_DRIVE_* vào .env.local.",
      );
    }

    let body: { name?: string };
    try {
      body = await request.json();
    } catch {
      return fail(400, "Dữ liệu gửi lên không hợp lệ.");
    }

    const name = safeDriveName(body.name);
    if (!name) return fail(400, "Album phải có tên.");

    // Email làm tên thư mục cho dễ nhận ra khi mở Drive. Không có email (hiếm,
    // vd đăng nhập ẩn danh) thì dùng uid — vẫn đúng, chỉ khó đọc hơn.
    const ownerFolderId = await ensureFolder(config, {
      name: caller.email ?? caller.uid,
      parentId: config.folderId,
      ownerUid: caller.uid,
    });

    const driveFolderId = await ensureFolder(config, {
      name,
      parentId: ownerFolderId,
      ownerUid: caller.uid,
    });

    return NextResponse.json({ driveFolderId, name });
  } catch (error) {
    if (error instanceof DriveError) return fail(error.status, error.message);
    console.error("[albums/create]", error);
    return fail(500, "Không tạo được album.");
  }
}

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}
