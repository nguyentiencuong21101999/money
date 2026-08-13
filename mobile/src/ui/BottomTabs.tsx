import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, inset } from "./theme";

export type TabKey = "home" | "shop" | "create" | "inbox" | "profile";

const TABS: {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: keyof typeof Ionicons.glyphMap;
  dot?: boolean;
}[] = [
  { key: "home", label: "Trang chủ", icon: "home", active: "home" },
  { key: "shop", label: "Cửa hàng", icon: "bag-handle-outline", active: "bag-handle", dot: true },
  { key: "create", label: "", icon: "add", active: "add" },
  { key: "inbox", label: "Hộp thư", icon: "chatbubble-ellipses-outline", active: "chatbubble-ellipses" },
  { key: "profile", label: "Hồ sơ", icon: "person-outline", active: "person" },
];

export function BottomTabs({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (t: TabKey) => void;
}) {
  return (
    <View style={styles.bar}>
      {TABS.map((t) =>
        t.key === "create" ? (
          <CreateButton key="create" onPress={() => onChange("create")} />
        ) : (
          <Pressable
            key={t.key}
            style={styles.tab}
            onPress={() => onChange(t.key)}
            hitSlop={8}
          >
            <View>
              <Ionicons
                name={active === t.key ? t.active : t.icon}
                size={25}
                color={active === t.key ? "#fff" : "rgba(255,255,255,0.78)"}
              />
              {t.dot && <View style={styles.dot} />}
            </View>
            <Text style={[styles.label, active === t.key && styles.labelOn]}>
              {t.label}
            </Text>
          </Pressable>
        ),
      )}
    </View>
  );
}

/**
 * Nút "+" đặc trưng TikTok: khối trắng bo góc, có hai mảng xanh (trái) và đỏ
 * (phải) thò ra như bóng lệch màu.
 */
function CreateButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.createWrap} onPress={onPress} hitSlop={8}>
      <View style={[styles.createEdge, styles.createCyan]} />
      <View style={[styles.createEdge, styles.createRed]} />
      <View style={styles.createWhite}>
        <Ionicons name="add" size={24} color="#000" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#000",
    paddingTop: 8,
    paddingBottom: inset.bottom,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  tab: { flex: 1, alignItems: "center", gap: 3 },
  label: { color: "rgba(255,255,255,0.78)", fontSize: 10, fontWeight: "500" },
  labelOn: { color: "#fff" },
  dot: {
    position: "absolute",
    top: -2,
    right: -5,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.red,
  },
  createWrap: {
    width: 46,
    height: 30,
    marginHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  createEdge: { position: "absolute", width: 42, height: 30, borderRadius: 9 },
  createCyan: { left: 0, backgroundColor: colors.cyan },
  createRed: { right: 0, backgroundColor: colors.red },
  createWhite: {
    width: 42,
    height: 30,
    borderRadius: 9,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
