import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
// "@firebase/auth" chứ không phải "firebase/auth" — xem giải thích ở src/firebase.ts.
// Dùng nhất quán một đường import để kiểu của User/Auth không đến từ hai bản khác nhau.
import { onAuthStateChanged, type User } from "@firebase/auth";
import { firebaseConfigured, getFirebaseAuth } from "./src/firebase";
import { signInWithGoogle } from "./src/google-auth";
import { BottomTabs, type TabKey } from "./src/ui/BottomTabs";
import { HomeFeed } from "./src/ui/HomeFeed";
import { ProfileScreen } from "./src/ui/ProfileScreen";
import { useCameraShare } from "./src/ui/useCameraShare";
import { colors, inset } from "./src/ui/theme";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  // Chưa cấu hình Firebase thì không có gì để chờ — coi như sẵn sàng ngay từ
  // đầu, thay vì vào effect rồi setState đồng bộ (gây thêm một lượt render thừa).
  const [ready, setReady] = useState(!firebaseConfigured);

  useEffect(() => {
    if (!firebaseConfigured) return;
    return onAuthStateChanged(getFirebaseAuth(), (u) => {
      setUser(u);
      setReady(true);
    });
  }, []);

  if (!firebaseConfigured) {
    return (
      <CenterScreen>
        <Text style={styles.title}>Chưa cấu hình Firebase</Text>
        <Text style={styles.muted}>
          Thiếu mobile/.env. Tạo bằng lệnh này ở thư mục gốc dự án:
        </Text>
        <Text style={styles.code}>
          sed -n {"'"}s/^NEXT_PUBLIC_FIREBASE_/EXPO_PUBLIC_FIREBASE_/p{"'"}
          {" .env.local > mobile/.env"}
        </Text>
      </CenterScreen>
    );
  }

  if (!ready) {
    return (
      <CenterScreen>
        <ActivityIndicator color="#fff" />
      </CenterScreen>
    );
  }

  return user ? <MainApp user={user} /> : <LoginScreen />;
}

/** Khung tab chính sau khi đăng nhập. */
function MainApp({ user }: { user: User }) {
  const [tab, setTab] = useState<TabKey>("home");
  // Đặt ở gốc app: chia sẻ camera chạy nền xuyên suốt mọi tab, chỉ dừng khi tự
  // tắt hoặc đăng xuất. Cũng lo tự bật lại nếu lần trước để bật (xem hook).
  const me = user.email?.toLowerCase() ?? "";
  const share = useCameraShare(me);

  return (
    <View style={styles.appRoot}>
      <StatusBar style="light" />
      <View style={styles.appBody}>
        {tab === "home" ? (
          <HomeFeed
            uid={user.uid}
            live={share.sharing}
            onToggleLive={() => void share.setEnabled(!share.sharing)}
          />
        ) : tab === "profile" ? (
          <ProfileScreen user={user} share={share} />
        ) : (
          <Placeholder tab={tab} />
        )}
      </View>
      <BottomTabs active={tab} onChange={setTab} />
    </View>
  );
}

const PLACEHOLDER: Record<string, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  shop: { icon: "bag-handle-outline", label: "Cửa hàng" },
  create: { icon: "add-circle-outline", label: "Tạo video" },
  inbox: { icon: "chatbubble-ellipses-outline", label: "Hộp thư" },
};

function Placeholder({ tab }: { tab: TabKey }) {
  const p = PLACEHOLDER[tab] ?? PLACEHOLDER.inbox;
  return (
    <View style={styles.placeholder}>
      <Ionicons name={p.icon} size={54} color={colors.faint} />
      <Text style={styles.placeholderTitle}>{p.label}</Text>
      <Text style={styles.muted}>Sắp ra mắt</Text>
    </View>
  );
}

function LoginScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function google() {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CenterScreen>
      <View style={styles.hero}>
        <Ionicons name="musical-notes" size={72} color="#fff" />
        <Text style={styles.brand}>Secret</Text>
      </View>

      <Pressable
        onPress={google}
        disabled={busy}
        style={({ pressed }) => [
          styles.loginBtn,
          busy && { opacity: 0.5 },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text style={styles.loginText}>
          {busy ? "Đang vào…" : "Đăng nhập với Google"}
        </Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
    </CenterScreen>
  );
}

function CenterScreen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.center}>
      <StatusBar style="light" />
      <View style={styles.centerBody}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  appRoot: { flex: 1, backgroundColor: colors.bg },
  appBody: { flex: 1 },

  center: { flex: 1, backgroundColor: colors.bg },
  centerBody: { flex: 1, padding: 24, gap: 12, justifyContent: "center" },
  title: { color: "#fff", fontSize: 22, fontWeight: "700" },
  muted: { color: colors.sub, fontSize: 14 },
  code: {
    fontSize: 11,
    color: colors.sub,
    backgroundColor: colors.card,
    padding: 10,
    borderRadius: 8,
  },

  hero: { alignItems: "center", gap: 10, marginBottom: 28 },
  brand: { color: "#fff", fontSize: 32, fontWeight: "800", letterSpacing: 0.5 },
  loginBtn: {
    backgroundColor: colors.red,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  loginText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  error: { color: "#ff6b6b", fontSize: 13, textAlign: "center" },

  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingTop: inset.top,
  },
  placeholderTitle: { color: "#fff", fontSize: 20, fontWeight: "700" },
});
