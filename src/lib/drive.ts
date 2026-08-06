/**
 * Google Drive làm kho ảnh. Chỉ chạy PHÍA SERVER — mọi hàm ở đây đọc biến môi
 * trường có chứa client secret và refresh token.
 *
 * VÌ SAO DÙNG REFRESH TOKEN CỦA CHỦ APP, KHÔNG DÙNG SERVICE ACCOUNT
 * Service account có Drive riêng nhưng KHÔNG có quota lưu trữ dùng được: upload
 * vào đó sẽ đổ storageQuotaExceeded. Cách vá thông thường là dùng Shared Drive,
 * nhưng Shared Drive chỉ có ở Google Workspace, tài khoản Gmail thường không có.
 * Nên đường đi được: xin OAuth MỘT LẦN bằng chính tài khoản chủ app, giữ lại
 * refresh token, rồi server mượn danh nghĩa đó để ghi. File thuộc sở hữu của chủ
 * app và tính vào 15GB của họ.
 *
 * VÌ SAO SCOPE drive.file
 * drive.file là scope NON-SENSITIVE: chỉ thấy được file do chính app tạo ra,
 * nên Google chỉ đòi basic verification — không có màn cảnh báo nặng, không có
 * nguy cơ bị đòi đánh giá bảo mật CASA như scope `drive` hay `drive.readonly`.
 * Đổi sang scope rộng hơn là tự mở ra cả quy trình đó, đừng đổi.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

/**
 * Ném ra khi thiếu cấu hình hoặc Google từ chối — route bắt lại và dịch sang tiếng Việt.
 *
 * Gán `status` trong thân constructor, ĐỪNG viết gọn thành parameter property
 * (`constructor(msg: string, readonly status: number)`). Cú pháp đó cần biên dịch
 * thật chứ không chỉ xoá kiểu, nên `node --experimental-strip-types` — đúng cái
 * mà `npm test` của repo đang dùng — sẽ ném ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX và
 * không file test nào import được module này.
 */
export class DriveError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface DriveConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Thư mục chứa ảnh. Bỏ trống thì file rơi vào gốc My Drive. */
  folderId: string | null;
}

/** null khi .env.local chưa điền — route dùng để trả lỗi hướng dẫn thay vì crash. */
export function driveConfig(): DriveConfig | null {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  return {
    clientId,
    clientSecret,
    refreshToken,
    folderId: process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || null,
  };
}

/**
 * Access token sống 1 giờ, xin lại mỗi request là thêm một vòng gọi mạng vào
 * đường đi của mọi tấm ảnh. Giữ lại trong RAM của instance.
 *
 * Trên serverless mỗi instance có bộ nhớ riêng và bị dọn bất kỳ lúc nào — đó là
 * chuyện bình thường, mất cache thì chỉ tốn thêm một lần xin token.
 * Trừ 60 giây trước khi hết hạn để không dùng đúng cái token vừa chết giữa đường.
 */
let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(config: DriveConfig): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload?.error ?? String(response.status);
    // invalid_grant nghĩa là refresh token đã chết — nói thẳng việc phải làm,
    // vì đây là lỗi cần chạy lại script chứ không phải lỗi tạm thời.
    if (code === "invalid_grant") {
      throw new DriveError(
        "Refresh token của Drive đã hết hiệu lực. Chạy lại `npm run drive-auth` để lấy token mới.",
        503,
      );
    }
    throw new DriveError(`Không lấy được access token của Drive (${code}).`, 502);
  }

  cached = {
    token: payload.access_token,
    expiresAt: Date.now() + (Number(payload.expires_in) || 3600) * 1000 - 60_000,
  };
  return cached.token;
}

export interface SessionRequest {
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** uid của người upload — ghi vào appProperties để sau này kiểm chủ sở hữu. */
  ownerUid: string;
  /**
   * Thư mục đích. Bỏ trống thì rơi vào thư mục gốc trong cấu hình.
   *
   * Route upload PHẢI kiểm thư mục này thuộc người đang gọi trước khi truyền
   * vào đây — hàm này tin những gì được đưa cho nó.
   */
  parentId?: string | null;
  /**
   * Origin của trình duyệt, lấy từ header request.
   *
   * BẮT BUỘC phải chuyển tiếp. Trình duyệt sẽ PUT bytes THẲNG lên session URI,
   * mà đó là cross-origin request; Google chỉ trả header CORS cho phép nếu lúc
   * TẠO session nó biết origin nào sắp gọi. Thiếu cái này thì bytes bị chặn ở
   * lớp CORS và ảnh không bao giờ lên được.
   */
  origin: string | null;
}

/**
 * Tạo phiên upload resumable, trả về URL để trình duyệt tự đẩy bytes lên.
 *
 * VÌ SAO KHÔNG CHO ẢNH ĐI QUA SERVER
 * Vercel chặn cứng body request ở 4,5MB và trả 413 trước khi code chạy — mà ảnh
 * gốc từ camera điện thoại thường 3–8MB, nghĩa là đường đi qua server hỏng ngay
 * với những tấm ảnh nét nhất. Resumable session gỡ đúng chỗ đó: server chỉ ký
 * giấy phép, bytes đi trực tiếp từ máy người dùng lên Google.
 *
 * Session URI đã mang sẵn quyền ghi nên đưa cho trình duyệt được, nhưng nó chỉ
 * ghi được đúng MỘT file vừa khai báo, và Google chốt kích thước theo
 * X-Upload-Content-Length. Session sống một tuần.
 */
export async function createUploadSession(
  config: DriveConfig,
  request: SessionRequest,
): Promise<string> {
  const token = await accessToken(config);

  const metadata: Record<string, unknown> = {
    name: request.name,
    mimeType: request.mimeType,
    // appProperties là map riêng của app, người dùng không thấy trong Drive UI.
    // Đây là chỗ neo quyền sở hữu: nhờ nó mà route đọc ảnh kiểm được ai là chủ
    // KHÔNG cần Firestore, tức không cần thêm service account cho tính năng này.
    appProperties: { ownerUid: request.ownerUid },
  };
  const parentId = request.parentId ?? config.folderId;
  if (parentId) metadata.parents = [parentId];

  const response = await fetch(`${UPLOAD_URL}?uploadType=resumable&fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": request.mimeType,
      "X-Upload-Content-Length": String(request.sizeBytes),
      ...(request.origin ? { Origin: request.origin } : {}),
    },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[drive] tạo session thất bại", response.status, detail);
    throw new DriveError(explainUpstream(response.status), response.status);
  }

  const location = response.headers.get("location");
  if (!location) {
    throw new DriveError("Google không trả về địa chỉ upload.", 502);
  }
  return location;
}

export const FOLDER_MIME = "application/vnd.google-apps.folder";

/**
 * Làm sạch tên trước khi gửi lên Drive.
 *
 * Chỉ bỏ hai dấu gạch chéo và gộp khoảng trắng. Drive coi tên là tên chứ không
 * phải đường dẫn, nên "/" không nguy hiểm — nhưng mở Drive bằng tay mà thấy tên
 * có gạch chéo thì rối, và tên quá dài thì bảng file không đọc được gì.
 *
 * Trả "" khi không còn ký tự nào dùng được — người gọi tự quyết định thay bằng gì.
 */
export function safeDriveName(raw: string | undefined, maxLength = 120): string {
  return (raw ?? "")
    .replace(/[\/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * Tìm thư mục theo tên trong một thư mục cha, chưa có thì tạo.
 *
 * Dùng để dựng cây email/tênAlbum/ dưới thư mục gốc. Gọi lại nhiều lần với cùng
 * tham số thì trả về đúng một thư mục, không sinh trùng — nên route gọi thẳng
 * mỗi lần tạo album, không cần tự nhớ đã tạo chưa.
 *
 * Thư mục tạo ra cũng mang appProperties.ownerUid như file ảnh. Nhờ vậy route
 * upload kiểm được "thư mục cha này có phải của người đang gọi không" mà không
 * cần đọc Firestore — nếu tin thẳng folderId do client gửi lên thì người ta đẩy
 * được ảnh vào thư mục của người khác.
 *
 * files.list với scope drive.file chỉ thấy file do app này tạo, nên không có
 * cách nào vô tình bắt trúng thư mục sẵn có của người dùng.
 */
export async function ensureFolder(
  config: DriveConfig,
  params: { name: string; parentId: string | null; ownerUid: string },
): Promise<string> {
  const token = await accessToken(config);
  const parent = params.parentId ?? "root";

  // Dấu nháy đơn trong tên sẽ phá cú pháp query của Drive — phải escape.
  const escaped = params.name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const query = [
    `name = '${escaped}'`,
    `mimeType = '${FOLDER_MIME}'`,
    `'${parent}' in parents`,
    "trashed = false",
  ].join(" and ");

  const found = await fetch(
    `${FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (found.ok) {
    const id = (await found.json())?.files?.[0]?.id;
    if (id) return id;
  } else {
    // Không tra được thì đi tiếp và tạo mới: thà có thư mục trùng tên còn hơn
    // chặn hẳn việc tạo album.
    console.warn("[drive] không tra được thư mục sẵn có", found.status);
  }

  const created = await fetch(`${FILES_URL}?fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: params.name,
      mimeType: FOLDER_MIME,
      appProperties: { ownerUid: params.ownerUid },
      ...(params.parentId ? { parents: [params.parentId] } : {}),
    }),
  });

  if (!created.ok) {
    const detail = await created.text().catch(() => "");
    console.error("[drive] tạo thư mục thất bại", created.status, detail);
    throw new DriveError(explainUpstream(created.status), created.status);
  }
  return (await created.json()).id;
}

/** Đổi tên thư mục (hoặc file) trên Drive. */
export async function renameFile(
  config: DriveConfig,
  fileId: string,
  name: string,
): Promise<void> {
  const token = await accessToken(config);
  const response = await fetch(`${FILES_URL}/${encodeURIComponent(fileId)}?fields=id`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[drive] đổi tên thất bại", response.status, detail);
    throw new DriveError(explainUpstream(response.status), response.status);
  }
}

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  /** Drive trả size dạng chuỗi; đã đổi sang số, 0 nếu thiếu. */
  size: number;
  ownerUid: string | null;
}

/** Đọc metadata để kiểm chủ sở hữu trước khi cho tải bytes. */
export async function fileInfo(
  config: DriveConfig,
  fileId: string,
): Promise<DriveFileInfo | null> {
  const token = await accessToken(config);
  const response = await fetch(
    `${FILES_URL}/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,appProperties`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[drive] đọc metadata thất bại", response.status, detail);
    throw new DriveError(explainUpstream(response.status), response.status);
  }

  const file = await response.json();
  return {
    id: file.id,
    name: file.name ?? "",
    mimeType: file.mimeType ?? "application/octet-stream",
    size: Number(file.size ?? 0),
    ownerUid: file.appProperties?.ownerUid ?? null,
  };
}

/**
 * Mở dòng bytes của một file. Trả nguyên Response để route chuyển tiếp `body`
 * đi luôn — không đọc hết vào RAM, vì ảnh gốc 8MB nhân vài request song song là
 * đủ làm hàm serverless hết bộ nhớ.
 */
export async function fileStream(config: DriveConfig, fileId: string): Promise<Response> {
  const token = await accessToken(config);
  const response = await fetch(
    `${FILES_URL}/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[drive] tải bytes thất bại", response.status, detail);
    throw new DriveError(explainUpstream(response.status), response.status);
  }
  return response;
}

export async function deleteFile(config: DriveConfig, fileId: string): Promise<void> {
  const token = await accessToken(config);
  const response = await fetch(`${FILES_URL}/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  // 404 = đã bị xoá từ trước. Coi như xong, đừng chặn người dùng dọn dữ liệu
  // chỉ vì file đã không còn ở đó.
  if (response.ok || response.status === 404) return;
  const detail = await response.text().catch(() => "");
  console.error("[drive] xoá thất bại", response.status, detail);
  throw new DriveError(explainUpstream(response.status), response.status);
}

function explainUpstream(status: number): string {
  if (status === 401 || status === 403) {
    return "Drive từ chối truy cập. Kiểm tra GOOGLE_DRIVE_REFRESH_TOKEN còn hiệu lực và GOOGLE_DRIVE_FOLDER_ID đúng thư mục do app tạo.";
  }
  if (status === 404) return "Không tìm thấy ảnh này trên Drive.";
  if (status === 429) return "Drive đang chặn vì gọi quá nhanh. Thử lại sau một lát.";
  if (status === 507 || status === 413) {
    return "Drive của bạn đã hết dung lượng. Dọn bớt hoặc nâng dung lượng Google One.";
  }
  return `Drive trả lỗi ${status}.`;
}
