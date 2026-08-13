import { Ionicons } from "@expo/vector-icons";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { signOut, type User } from "@firebase/auth";
import { getFirebaseAuth } from "../firebase";
import { signOutGoogle } from "../google-auth";
import { colors, formatCount, inset } from "./theme";
import { Toggle } from "./Toggle";
import type { useCameraShare } from "./useCameraShare";

type ShareController = ReturnType<typeof useCameraShare>;

function connLabel(s: RTCPeerConnectionState | null): string {
  switch (s) {
    case "connected":
      return "đã kết nối";
    case "connecting":
      return "đang kết nối…";
    case "disconnected":
      return "mất kết nối";
    case "failed":
      return "kết nối lỗi";
    default:
      return "đang chờ người xem";
  }
}

/**
 * Tab Hồ sơ: header kiểu TikTok + phần "Tài khoản" hiện thông tin đăng nhập +
 * nút Đăng xuất, và nút gạt Chia sẻ camera (chức năng thật của app).
 */
export function ProfileScreen({
  user,
  share,
}: {
  user: User;
  share: ShareController;
}) {
  const name = user.displayName ?? "Người dùng";
  const email = user.email ?? "—";
  const handle = "@" + (email.split("@")[0] || "user");

  function confirmLogout() {
    Alert.alert("Đăng xuất", "Bạn chắc chắn muốn đăng xuất?", [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Đăng xuất",
        style: "destructive",
        onPress: () => {
          void signOutGoogle();
          void signOut(getFirebaseAuth());
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        {user.photoURL ? (
          <Image source={{ uri: user.photoURL }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarLetter}>
              {name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.handle}>{handle}</Text>

        <View style={styles.stats}>
          <Stat value={12} label="Đang follow" />
          <Divider />
          <Stat value={village()} label="Follower" />
          <Divider />
          <Stat value={340} label="Thích" />
        </View>
      </View>

      <Section title="Tài khoản">
        <Row icon="person-outline" label="Tên hiển thị" value={name} />
        <Row icon="mail-outline" label="Email" value={email} />
        <Row
          icon="finger-print-outline"
          label="ID tài khoản"
          value={user.uid}
          mono
        />
        <Row
          icon="shield-checkmark-outline"
          label="Đăng nhập bằng"
          value="Google"
        />
      </Section>

      <Section title="Chia sẻ camera">
        <View style={styles.row}>
          <Ionicons name="videocam-outline" size={20} color={colors.sub} />
          <Text style={styles.rowLabel}>Bật chia sẻ</Text>
          <View style={styles.rowRight}>
            <Toggle
              value={share.sharing}
              onValueChange={(v) => void share.setEnabled(v)}
            />
          </View>
        </View>

        <View style={[styles.row, styles.rowLast]}>
          <Ionicons name="mail-outline" size={20} color={colors.sub} />
          <Text style={styles.rowLabel}>Người xem</Text>
          <View style={styles.rowRight}>
            <TextInput
              style={styles.emailInput}
              value={share.target}
              onChangeText={(t) => void share.setTarget(t)}
              editable={!share.sharing}
              placeholder="email@example.com"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          </View>
        </View>
      </Section>

      {share.sharing && (
        <View style={styles.status}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>
            Đang chia sẻ · {share.state.count} người · {connLabel(share.state.connState)}
          </Text>
        </View>
      )}
      {share.state.error && (
        <Text style={styles.shareError}>{share.state.error}</Text>
      )}

      <Pressable
        style={({ pressed }) => [styles.logout, pressed && { opacity: 0.85 }]}
        onPress={confirmLogout}
      >
        <Ionicons name="log-out-outline" size={20} color={colors.red} />
        <Text style={styles.logoutText}>Đăng xuất</Text>
      </Pressable>
    </ScrollView>
  );
}

// Số follower giả cho đẹp header.
function village() {
  return 1280;
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{formatCount(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.statDivider} />;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  mono,
  chevron,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  mono?: boolean;
  chevron?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && onPress ? { opacity: 0.6 } : null]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Ionicons name={icon} size={20} color={colors.sub} />
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        {value ? (
          <Text
            style={[styles.rowValue, mono && styles.mono]}
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null}
        {chevron && (
          <Ionicons name="chevron-forward" size={18} color={colors.faint} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingTop: inset.top, paddingBottom: 40 },
  header: { alignItems: "center", paddingHorizontal: 20, paddingBottom: 8 },
  avatar: { width: 92, height: 92, borderRadius: 46, backgroundColor: "#222" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarLetter: { color: "#fff", fontSize: 40, fontWeight: "700" },
  name: { color: "#fff", fontSize: 20, fontWeight: "700", marginTop: 12 },
  handle: { color: colors.sub, fontSize: 14, marginTop: 2 },

  stats: { flexDirection: "row", alignItems: "center", marginTop: 18 },
  stat: { alignItems: "center", paddingHorizontal: 18 },
  statValue: { color: "#fff", fontSize: 17, fontWeight: "700" },
  statLabel: { color: colors.sub, fontSize: 12, marginTop: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: colors.line },

  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionTitle: {
    color: colors.sub,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { color: "#fff", fontSize: 15 },
  rowRight: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 },
  rowValue: { color: colors.sub, fontSize: 14, maxWidth: 200 },
  mono: { fontSize: 12 },
  emailInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    textAlign: "right",
    paddingVertical: 0,
  },

  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    marginHorizontal: 20,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red },
  statusText: { color: colors.sub, fontSize: 13 },
  shareError: {
    color: "#ff6b6b",
    fontSize: 13,
    marginTop: 8,
    marginHorizontal: 20,
  },

  logout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 28,
    marginHorizontal: 16,
    paddingVertical: 15,
    borderRadius: 14,
    backgroundColor: colors.card,
  },
  logoutText: { color: colors.red, fontSize: 16, fontWeight: "600" },
});
