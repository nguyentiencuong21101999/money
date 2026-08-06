#!/usr/bin/env node
/**
 * Lấy refresh token của Google Drive — chạy MỘT LẦN duy nhất.
 * Chạy: npm run drive-auth
 *
 * VÌ SAO PHẢI CÓ BƯỚC NÀY
 * Server cần ghi file vào Drive của bạn, nhưng không thể tự đăng nhập thay bạn.
 * Service account thì không dùng được: nó có Drive riêng nhưng KHÔNG có quota
 * lưu trữ, upload vào là đổ storageQuotaExceeded. Cách vá bằng Shared Drive chỉ
 * có ở Google Workspace, tài khoản Gmail thường không có.
 *
 * Nên đường đi được: bạn đồng ý một lần qua trình duyệt, Google trả về refresh
 * token, server giữ token đó và từ đó tự xin access token mãi về sau. File thuộc
 * sở hữu của bạn và tính vào 15GB của bạn.
 *
 * Script chỉ IN RA giá trị, không tự sửa .env.local — tự ghi vào file chứa secret
 * của người khác là việc không nên làm thay.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

/** Phải khớp đúng chuỗi đã khai trong Google Cloud Console. Đổi là hỏng. */
const PORT = 5858;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

/**
 * drive.file: chỉ thấy được file do chính app này tạo.
 *
 * Đây là scope NON-SENSITIVE, nên Google chỉ đòi basic verification. Đừng đổi
 * sang `drive` hay `drive.readonly` — đó là RESTRICTED scope, kéo theo cả quy
 * trình đánh giá bảo mật CASA (do bên thứ ba làm, có phí) và một màn cảnh báo
 * đỏ trước mặt người dùng.
 */
const SCOPE = "https://www.googleapis.com/auth/drive.file";

/** Thư mục chứa ảnh trong Drive của bạn. */
const FOLDER_NAME = "Thư viện ảnh — Sổ tiền";

function readEnvLocal() {
  try {
    return Object.fromEntries(
      readFileSync(new URL("../.env.local", import.meta.url), "utf8")
        .split("\n")
        .map((line) => line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/))
        .filter(Boolean)
        .map(([, key, value]) => [key, value.trim()]),
    );
  } catch {
    return {};
  }
}

function setupHelp() {
  console.log(`
Chưa có GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET trong .env.local.

Làm 5 bước này ở Google Cloud Console (dùng ĐÚNG project Firebase đang dùng thì
đỡ phải quản lý hai project):

  1. console.cloud.google.com/apis/library/drive.googleapis.com
     → bấm ENABLE để bật Google Drive API.

  2. console.cloud.google.com/auth/branding
     → điền tên app + email hỗ trợ. User type chọn External.

  3. console.cloud.google.com/auth/scopes
     → Add scope → dán: ${SCOPE}
     Đây là scope non-sensitive nên KHÔNG cần verification để tự mình dùng.

  4. console.cloud.google.com/auth/audience
     → Test users → thêm chính email Google của bạn.
     Hoặc bấm "Publish app" để refresh token không hết hạn sau 7 ngày —
     xem lại phần cuối script này.

  5. console.cloud.google.com/auth/clients
     → Create client → Application type: Web application
     → Authorized redirect URIs → thêm ĐÚNG chuỗi này:
        ${REDIRECT_URI}
     → Create, rồi copy Client ID và Client secret.

Xong thì thêm vào .env.local:

  GOOGLE_DRIVE_CLIENT_ID=...
  GOOGLE_DRIVE_CLIENT_SECRET=...

rồi chạy lại: npm run drive-auth
`);
}

/** Đợi Google gọi về localhost với ?code=... */
function waitForCode() {
  return new Promise((resolve, reject) => {
    /*
      Phải tự nắm danh sách socket để đóng tay.

      server.close() CHỈ ngừng nhận kết nối mới, nó vẫn đợi các kết nối đang mở
      kết thúc. Trình duyệt thì giữ keep-alive sau khi tải xong trang, nên nếu
      không đóng tay thì handle đó sống mãi, event loop không bao giờ rỗng, và
      script treo vĩnh viễn dù đã làm xong việc — kèm hậu quả tệ hơn: stdout khi
      bị redirect vào pipe là block-buffer, treo nghĩa là token không bao giờ
      được in ra.

      Không dùng process.exit() để thoát cho nhanh: với stdout là pipe, exit sẽ
      cắt luôn phần đang chờ ghi. Đóng socket rồi để process tự thoát thì stdout
      được xả hết.
    */
    const sockets = new Set();

    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }

      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      // Trả một trang cho người dùng thấy đã xong, rồi mới đóng server —
      // đóng trước khi ghi xong response thì trình duyệt hiện lỗi kết nối.
      // Connection: close để trình duyệt không giữ keep-alive.
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        Connection: "close",
      });
      res.end(
        `<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;padding:3rem;text-align:center">
         <p>${code ? "Xong. Quay lại cửa sổ terminal nhé." : `Thất bại: ${error ?? "không rõ"}`}</p>
         </body>`,
      );

      server.close();
      // Đóng tay mọi socket còn mở, kể cả cái vừa trả lời xong — xem ghi chú ở
      // khai báo `sockets`. Thiếu dòng này là script treo sau khi đã làm xong việc.
      for (const socket of sockets) socket.destroy();

      if (code) resolve(code);
      else reject(new Error(error ?? "Google không trả về code."));
    });

    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });

    server.on("error", (e) => {
      if (e.code === "EADDRINUSE") {
        reject(
          new Error(
            `Cổng ${PORT} đang bị chiếm. Tắt tiến trình đang dùng cổng đó rồi chạy lại.`,
          ),
        );
      } else {
        reject(e);
      }
    });

    server.listen(PORT);
  });
}

async function postForm(url, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `${url} trả ${response.status}: ${payload?.error_description ?? payload?.error ?? "không rõ"}`,
    );
  }
  return payload;
}

/** Tạo thư mục chứa ảnh. App tạo ra nên drive.file vẫn ghi vào được về sau. */
async function createFolder(accessToken) {
  const response = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Không tạo được thư mục: ${payload?.error?.message ?? response.status}`);
  }
  return payload.id;
}

const env = { ...readEnvLocal(), ...process.env };
const clientId = env.GOOGLE_DRIVE_CLIENT_ID;
const clientSecret = env.GOOGLE_DRIVE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  setupHelp();
  process.exit(1);
}

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    // offline mới có refresh_token; thiếu nó thì chỉ được access token 1 giờ.
    access_type: "offline",
    // Google CHỈ trả refresh_token ở lần đồng ý đầu tiên. prompt=consent buộc nó
    // hỏi lại mỗi lần chạy, nên chạy lại script lần thứ hai vẫn ra token —
    // không có dòng này thì lần sau chỉ nhận được access_token và bạn tưởng hỏng.
    prompt: "consent",
  });

console.log(`
Mở đường dẫn này trong trình duyệt (đăng nhập bằng tài khoản Google sẽ chứa ảnh):

${authUrl}

Đang đợi ở ${REDIRECT_URI} …
`);

try {
  const code = await waitForCode();

  const tokens = await postForm("https://oauth2.googleapis.com/token", {
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  });

  if (!tokens.refresh_token) {
    throw new Error(
      "Google không trả refresh_token. Vào myaccount.google.com/permissions, xoá quyền đã cấp cho app này rồi chạy lại.",
    );
  }

  const folderId = await createFolder(tokens.access_token);

  console.log(`
Xong. Dán 4 dòng này vào .env.local rồi chạy lại npm run dev:

GOOGLE_DRIVE_CLIENT_ID=${clientId}
GOOGLE_DRIVE_CLIENT_SECRET=${clientSecret}
GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}
GOOGLE_DRIVE_FOLDER_ID=${folderId}

Đã tạo thư mục "${FOLDER_NAME}" trong Drive của bạn — ảnh sẽ nằm ở đó.

LƯU Ý VỀ HẠN 7 NGÀY
Refresh token của OAuth2 vốn KHÔNG có hạn. Cái 7 ngày là luật riêng của đúng một
trạng thái: consent screen kiểu External + publishing status "Testing".

Nên vào console.cloud.google.com/auth/audience → bấm "Publish app" là luật đó
không còn áp dụng nữa. Publish mà chưa verify vẫn dùng được cho tới 100 người:
chỉ hiện thêm một màn cảnh báo "Google hasn't verified this app" → Advanced →
Go to (unsafe).

Sau khi publish, thứ duy nhất còn giết được token trong trường hợp này là KHÔNG
DÙNG SUỐT 6 THÁNG. Đổi mật khẩu Google thì không sao — luật đó chỉ áp với token
chứa scope Gmail, còn đây là drive.file.

Token có chết thì cũng không phải đi mò: Google trả invalid_grant, và src/lib/drive.ts
bắt riêng mã đó để hiện đúng câu "chạy lại npm run drive-auth".
`);
} catch (e) {
  console.error(`\nThất bại: ${e.message}\n`);
  process.exit(1);
}
