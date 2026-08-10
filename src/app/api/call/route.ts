import { NextResponse } from "next/server";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { isAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";

/**
 * Nhắn một người dùng vào chia sẻ camera: ghi một thông báo có link mở trang
 * xác nhận chia sẻ, rồi đẩy push tới các máy của họ. KHÔNG bật camera của ai —
 * chỉ là lời nhắn "mời bạn mở trang chia sẻ"; họ vẫn tự bấm Đồng ý.
 *
 * Cần server vì: tra uid từ email người khác và ghi vào hộp thư người khác đều
 * bị Firestore rules chặn ở trình duyệt (cố ý). Chỉ tài khoản admin gọi được.
 */
function connect(): { error: string } | null {
  if (getApps().length > 0) return null;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    return { error: "Thiếu FIREBASE_SERVICE_ACCOUNT. Xem bước B9 trong CHECKLIST.md." };
  }

  try {
    const key = JSON.parse(raw);
    initializeApp({
      credential: cert({
        projectId: key.project_id,
        clientEmail: key.client_email,
        privateKey: String(key.private_key).replace(/\\n/g, "\n"),
      }),
    });
    return null;
  } catch (e) {
    console.error("[call] service account", e);
    return { error: "FIREBASE_SERVICE_ACCOUNT không phải JSON hợp lệ." };
  }
}

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

const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (e) {
    console.error("[call]", e);
    const message = e instanceof Error ? e.message : String(e);
    return fail(500, `Gửi thất bại: ${message}`);
  }
}

async function handle(request: Request) {
  const email = await callerEmail(request);
  if (!email) return fail(401, "Cần đăng nhập.");
  if (!isAdminEmail(email)) return fail(403, "Tài khoản này không được gửi.");

  let payload: { callId?: string; calleeEmail?: string; callerName?: string };
  try {
    payload = await request.json();
  } catch {
    return fail(400, "Dữ liệu gửi lên không hợp lệ.");
  }

  const callId = payload.callId?.trim();
  const calleeEmail = payload.calleeEmail?.trim().toLowerCase();
  const callerName = payload.callerName?.trim() || "Quản trị viên";
  if (!callId || !calleeEmail) return fail(400, "Thiếu mã room hoặc email người nhận.");

  const broken = connect();
  if (broken) return fail(503, broken.error);

  let calleeUid: string;
  try {
    calleeUid = (await getAuth().getUserByEmail(calleeEmail)).uid;
  } catch {
    return fail(404, `Không tìm thấy tài khoản nào dùng email ${calleeEmail}.`);
  }

  const db = getFirestore();
  const link = `/goi?xem=${callId}`;
  const title = "Yêu cầu xem camera";
  const body = `${callerName} muốn xem camera của bạn. Bấm để mở trang chia sẻ.`;
  const notice = await db.collection(`users/${calleeUid}/notifications`).add({
    title,
    body,
    link,
    isRead: false,
    createdAt: FieldValue.serverTimestamp(),
    sentBy: email,
  });

  const devices = await db.collection(`users/${calleeUid}/devices`).get();
  const tokens = devices.docs
    .map((d) => String(d.data().token ?? ""))
    .filter(Boolean)
    .slice(0, 500);

  let sent = 0;
  let failed = 0;
  if (tokens.length > 0) {
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: { notiId: notice.id, link },
      webpush: { fcmOptions: { link } },
    });
    sent = response.successCount;
    failed = response.failureCount;

    await Promise.all(
      response.responses.map(async (result, index) => {
        const error = result.error;
        if (result.success || !error) return;
        console.error("[call] token lỗi", error.code, error.message);
        if (DEAD_TOKEN_CODES.has(error.code)) {
          await devices.docs[index].ref.delete();
        }
      }),
    );
  }

  return NextResponse.json({ notiId: notice.id, sent, failed });
}

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}
