import { NextResponse } from "next/server";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { isAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";

/**
 * Gửi thông báo cho một người dùng: ghi vào hộp thư trong app, rồi đẩy tới các
 * máy họ đã bật thông báo.
 *
 * Bắt buộc phải có service account (FIREBASE_SERVICE_ACCOUNT). Không lách được:
 * API gửi FCM đòi OAuth ký bằng khoá riêng, còn ghi vào hộp thư của NGƯỜI KHÁC
 * thì rules chặn phía trình duyệt — cố tình chặn, để tránh người dùng tự gửi
 * thông báo cho nhau.
 */
function connect(): { error: string } | null {
  if (getApps().length > 0) return null;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    return {
      error:
        "Thiếu FIREBASE_SERVICE_ACCOUNT. Xem bước B9 trong CHECKLIST.md. Hộp thư trong app vẫn xem được, chỉ chưa gửi được.",
    };
  }

  try {
    const key = JSON.parse(raw);
    initializeApp({
      credential: cert({
        projectId: key.project_id,
        clientEmail: key.client_email,
        // Dán JSON vào biến môi trường thì xuống dòng thật biến thành \n hai ký
        // tự — không hoàn nguyên thì khoá sai định dạng và ký thất bại.
        privateKey: String(key.private_key).replace(/\\n/g, "\n"),
      }),
    });
    return null;
  } catch (e) {
    console.error("[notify] service account", e);
    return { error: "FIREBASE_SERVICE_ACCOUNT không phải JSON hợp lệ." };
  }
}

/** Xác thực người gọi, trả về email hoặc null. Giống cách /api/scan đang làm. */
async function callerEmail(request: Request): Promise<string | null> {
  const webApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const idToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!webApiKey || !idToken) return null;

  try {
    const lookup = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${webApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      },
    );
    if (!lookup.ok) return null;
    return (await lookup.json())?.users?.[0]?.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/** Token đã chết — xoá khỏi Firestore luôn, đừng để lần sau gửi vào hư không. */
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

export async function POST(request: Request) {
  // Bọc tất cả: route handler ném exception thì Next trả 500 với BODY RỖNG, và
  // phía trình duyệt chỉ thấy "Unexpected end of JSON input" — không nói được
  // hỏng ở đâu. Thà trả về nguyên văn lỗi của Google.
  try {
    return await send(request);
  } catch (e) {
    console.error("[notify]", e);
    const code = (e as { code?: number | string })?.code;
    const message = e instanceof Error ? e.message : String(e);
    if (code === 7 || /insufficient permissions/i.test(message)) {
      return fail(
        503,
        "Service account chưa có quyền Firestore. Vào Google Cloud Console > IAM, cấp cho firebase-adminsdk-…@ vai trò \"Cloud Datastore User\" rồi thử lại sau một phút.",
      );
    }
    return fail(500, `Gửi thất bại: ${message}`);
  }
}

async function send(request: Request) {
  const email = await callerEmail(request);
  if (!email) return fail(401, "Cần đăng nhập.");
  if (!isAdminEmail(email)) return fail(403, "Tài khoản này không được gửi thông báo.");

  let payload: { uid?: string; title?: string; body?: string; link?: string };
  try {
    payload = await request.json();
  } catch {
    return fail(400, "Dữ liệu gửi lên không hợp lệ.");
  }

  const uid = payload.uid?.trim();
  const title = payload.title?.trim();
  const body = payload.body?.trim() ?? "";
  // Bấm vào thông báo trên màn hình thì mở thẳng hộp thư, không đổ về trang chủ.
  const link = payload.link?.trim() || "/thong-bao";
  if (!uid || !title) return fail(400, "Thiếu người nhận hoặc tiêu đề.");

  const broken = connect();
  if (broken) return fail(503, broken.error);

  const db = getFirestore();

  // Ghi hộp thư TRƯỚC khi đẩy: đẩy hỏng thì người dùng vẫn thấy khi mở app,
  // còn ghi hỏng mà đã đẩy rồi thì bấm vào thông báo sẽ chẳng có gì để mở.
  const notice = await db.collection(`users/${uid}/notifications`).add({
    title,
    body,
    link,
    isRead: false,
    createdAt: FieldValue.serverTimestamp(),
    sentBy: email,
  });

  const devices = await db.collection(`users/${uid}/devices`).get();
  const tokens = devices.docs
    .map((d) => String(d.data().token ?? ""))
    .filter(Boolean)
    .slice(0, 500); // trần một lượt gửi của FCM

  let sent = 0;
  let failed = 0;
  let cleaned = 0;

  if (tokens.length > 0) {
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      // notiId để bấm vào thông báo là mở đúng nó và đánh dấu đã đọc.
      data: { notiId: notice.id, link },
      webpush: { fcmOptions: { link } },
    });

    sent = response.successCount;
    failed = response.failureCount;

    await Promise.all(
      response.responses.map(async (result, index) => {
        const code = result.error?.code;
        if (result.success || !code || !DEAD_TOKEN_CODES.has(code)) return;
        cleaned += 1;
        await devices.docs[index].ref.delete();
      }),
    );
  }

  await notice.update({ sent, failed });

  return NextResponse.json({ id: notice.id, sent, failed, cleaned });
}

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}
