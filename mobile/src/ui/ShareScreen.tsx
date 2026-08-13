import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import type { User } from "@firebase/auth";
import { RTCView } from "react-native-webrtc";
import { roomId } from "../../../src/lib/call";
import { useShare } from "../useShare";
import { colors } from "./theme";

function stateLabel(s: RTCPeerConnectionState | null): string {
  switch (s) {
    case "connected":
      return "Đã kết nối";
    case "connecting":
      return "Đang kết nối…";
    case "disconnected":
      return "Mất kết nối";
    case "failed":
      return "Kết nối thất bại (mạng chặt, cần TURN)";
    default:
      return "Đang chờ…";
  }
}

/**
 * Màn chia sẻ camera — CHỨC NĂNG THẬT của app. Trước đây là ShareScreen trong
 * App.tsx; tách ra đây để mở từ tab Hồ sơ, giữ nguyên logic useShare.
 */
export function ShareScreen({ user, onBack }: { user: User; onBack: () => void }) {
  const [target, setTarget] = useState("cuongnguyen21101999@gmail.com");
  const me = user.email?.toLowerCase() ?? "";
  const { state, sharing, start, stop } = useShare(me);

  const id = target.trim() ? roomId(me, target) : "";
  // `MediaStream` của react-native-webrtc có thêm toURL() để RTCView vẽ; kiểu DOM
  // dùng chung với web không biết method này nên phải ép kiểu ở đúng chỗ hiển thị.
  const streamUrl = state.localStream
    ? (state.localStream as unknown as { toURL(): string }).toURL()
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Pressable onPress={sharing ? stop : onBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Chia sẻ camera</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.body}>
        {sharing ? (
          <>
            <Text style={styles.h1}>
              {state.localStream ? "Đang kết nối ♥" : "Đang chờ"}
            </Text>
            <Text style={styles.muted}>
              {state.localStream
                ? stateLabel(state.connState)
                : "Chỉ bật khi người kia vào."}
            </Text>

            <View style={styles.preview}>
              {streamUrl ? (
                <RTCView
                  streamURL={streamUrl}
                  style={styles.flex}
                  objectFit="cover"
                  mirror
                />
              ) : (
                <Text style={styles.previewIdle}>Đang tắt</Text>
              )}
            </View>

            <Text style={styles.muted}>{state.count} người trong room</Text>
            {state.error && <Text style={styles.error}>{state.error}</Text>}

            <Button label="Dừng" onPress={stop} danger />
          </>
        ) : (
          <>
            <Text style={styles.muted}>{me}</Text>
            <Text style={styles.label}>Email người sẽ xem camera của bạn</Text>
            <TextInput
              style={styles.input}
              placeholder="nguoixem@example.com"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={target}
              onChangeText={setTarget}
            />
            {id !== "" && <Text style={styles.code}>{id}</Text>}
            <Button
              label="Bắt đầu chia sẻ"
              onPress={() => start(id)}
              disabled={id === ""}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function Button({
  label,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        danger && styles.buttonDanger,
        disabled && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "600" },
  body: { flex: 1, padding: 20, gap: 12 },
  h1: { color: "#fff", fontSize: 22, fontWeight: "700" },
  label: { color: "#fff", fontSize: 13, fontWeight: "500", marginTop: 8 },
  muted: { color: colors.sub, fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#fff",
    backgroundColor: colors.card,
  },
  code: {
    fontSize: 11,
    color: colors.sub,
    backgroundColor: colors.card,
    padding: 10,
    borderRadius: 8,
  },
  button: {
    backgroundColor: colors.red,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDanger: { backgroundColor: "#3a3a3a" },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  error: { color: "#ff6b6b", fontSize: 13 },
  preview: {
    aspectRatio: 3 / 4,
    backgroundColor: "#000",
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
  },
  previewIdle: { color: colors.faint, fontSize: 13 },
});
