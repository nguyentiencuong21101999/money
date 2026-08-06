/**
 * Xác thực người gọi API bằng ID token của Firebase. Chỉ dùng phía server.
 *
 * Kiểm bằng REST endpoint của Google thay vì firebase-admin: khỏi bắt buộc phải
 * có service account cho tính năng ảnh, và khỏi kéo thêm ~10MB vào bundle.
 * /api/scan và /api/notify có bản riêng của chúng — cố ý không gom vào đây để
 * phần ảnh đứng độc lập, sửa bên này không động tới sổ tiền.
 *
 * Khác bản của /api/notify ở một điểm quan trọng: hàm này trả về cả `uid`.
 * Quyền sở hữu ảnh neo theo uid chứ không theo email — email đổi được, uid thì
 * không, và uid mới là thứ Firestore rules so sánh.
 */

export interface Caller {
  uid: string;
  email: string | null;
}

/** null nghĩa là không xác thực được: thiếu token, token hết hạn, hoặc mất mạng. */
export async function callerOf(request: Request): Promise<Caller | null> {
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

    const user = (await lookup.json())?.users?.[0];
    // localId là uid. Thiếu nó thì token không dùng được để phân quyền.
    if (!user?.localId) return null;
    return { uid: user.localId, email: user.email?.toLowerCase() ?? null };
  } catch {
    return null;
  }
}
