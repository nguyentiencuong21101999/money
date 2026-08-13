import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { roomId } from "../../../src/lib/call";
import { useShare } from "../useShare";

/**
 * Bọc useShare thêm phần GHI NHỚ trạng thái bật/tắt: bật rồi thì lần sau mở app
 * tự bật lại, tắt thì thôi. Phải đặt ở gốc app (MainApp) chứ không trong một màn
 * hình con — vì useShare tự dừng chia sẻ khi component unmount, để trong màn con
 * thì rời màn là tắt.
 */
const KEY_ENABLED = "share.enabled";
const KEY_TARGET = "share.target";
const DEFAULT_TARGET = "cuongnguyen21101999@gmail.com";

export function useCameraShare(myEmail: string) {
  const { state, sharing, start, stop } = useShare(myEmail);
  const [target, setTargetState] = useState(DEFAULT_TARGET);
  const [loaded, setLoaded] = useState(false);
  // Chỉ tự bật một lần cho mỗi phiên, tránh bật lại mỗi lần re-render.
  const autoStarted = useRef(false);

  const roomFor = useCallback(
    (t: string) => roomId(myEmail.toLowerCase(), t.trim()),
    [myEmail],
  );

  // Nạp cấu hình đã lưu; nếu lần trước để BẬT thì tự chia sẻ ngay.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [en, tg] = await Promise.all([
        AsyncStorage.getItem(KEY_ENABLED),
        AsyncStorage.getItem(KEY_TARGET),
      ]);
      if (!alive) return;
      const t = tg || DEFAULT_TARGET;
      setTargetState(t);
      setLoaded(true);
      if (en === "1" && !autoStarted.current) {
        const id = roomFor(t);
        if (id) {
          autoStarted.current = true;
          start(id);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [roomFor, start]);

  const setTarget = useCallback(async (t: string) => {
    setTargetState(t);
    await AsyncStorage.setItem(KEY_TARGET, t);
  }, []);

  /** Bật/tắt chia sẻ VÀ ghi nhớ để lần sau mở app làm theo. */
  const setEnabled = useCallback(
    async (on: boolean) => {
      if (on) {
        const id = roomFor(target);
        if (!id) return;
        autoStarted.current = true; // đã bật thủ công thì khỏi tự bật lại
        start(id);
        await AsyncStorage.setItem(KEY_ENABLED, "1");
      } else {
        stop();
        await AsyncStorage.setItem(KEY_ENABLED, "0");
      }
    },
    [roomFor, start, stop, target],
  );

  return { state, sharing, loaded, target, setTarget, setEnabled };
}
