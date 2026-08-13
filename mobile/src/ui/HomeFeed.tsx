import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  FlatList,
  Image,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { setPipImage } from "../keepalive-pip";
import {
  authHeaders,
  fetchPhotoBase64,
  photoUrl,
  usePhotos,
  webConfigured,
  type Photo,
} from "../photos";
import { colors, formatCount, inset } from "./theme";

/**
 * Feed kiểu TikTok (nguỵ trang), nội dung là ẢNH THẬT trong thư viện — chính là
 * ảnh bản web đã upload lên Google Drive (Firestore giữ danh sách, ảnh gốc lấy
 * qua API của web).
 *
 * Vuốt tới ảnh nào thì đẩy ảnh đó xuống native để lúc thoát app, ô PiP hiện đúng
 * tấm đang xem (xem setPipImage → KeepAlivePip.setImage).
 *
 * Phần chữ (tên người đăng, caption, số like) vẫn là dữ liệu giả cho giống app
 * thật — chỉ có ảnh là thật.
 */
const FAKE = [
  { author: "Kwon", caption: "xhđ có cần phải dz vậy ko", tags: ["junghaein", "ourstickerlove", "xhuong"], likes: 1172, comments: 6, saves: 45, shares: 59 },
  { author: "mây.trắng", caption: "một ngày nắng đẹp", tags: ["dalat", "review", "fyp"], likes: 20400, comments: 312, saves: 1800, shares: 640 },
  { author: "beo.map", caption: "lưu lại kỷ niệm", tags: ["xuhuong", "luugiu", "fyp"], likes: 8930, comments: 128, saves: 5200, shares: 410 },
];

const TOP_TABS = ["Hồ Chí Minh", "Bạn bè", "Đã follow", "Đề xuất"];

export function HomeFeed({
  uid,
  live,
  onToggleLive,
}: {
  uid: string | undefined;
  live: boolean;
  onToggleLive: () => void;
}) {
  const { photos, loading, error } = usePhotos(uid);
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(0);
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);

  // Token để <Image> tải được ảnh gốc (API của web đòi Authorization).
  useEffect(() => {
    let alive = true;
    void authHeaders().then((h) => alive && setHeaders(h));
    return () => {
      alive = false;
    };
  }, [uid]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (height <= 0) return;
    const i = Math.round(e.nativeEvent.contentOffset.y / height);
    const clamped = Math.max(0, Math.min(photos.length - 1, i));
    if (clamped !== active) setActive(clamped);
  };

  // Đẩy ảnh đang xem xuống native cho ô PiP. Tải bản gốc (nét) rồi mới gửi;
  // native tự lo: chưa bật PiP thì ghi nhớ, đang bật thì đổi ảnh ngay.
  useEffect(() => {
    const photo = photos[active];
    if (!photo) return;
    let alive = true;
    void fetchPhotoBase64(photo.driveFileId).then((b64) => {
      if (alive && b64) setPipImage(b64);
    });
    return () => {
      alive = false;
    };
  }, [active, photos]);

  return (
    <View style={styles.root} onLayout={onLayout(setHeight)}>
      {height > 0 && photos.length > 0 && (
        <FlatList
          data={photos}
          keyExtractor={(p) => p.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={height}
          decelerationRate="fast"
          onMomentumScrollEnd={onScrollEnd}
          renderItem={({ item, index }) => (
            <PostView photo={item} index={index} height={height} headers={headers} />
          )}
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
        />
      )}

      {/* Đang tải Firestore thì để trống (loading duy nhất là trên từng ảnh);
          tải xong mà rỗng mới báo "Chưa có ảnh". */}
      {!loading && photos.length === 0 && <Empty error={error} height={height} />}

      <TopBar live={live} onToggleLive={onToggleLive} />
    </View>
  );
}

const onLayout = (set: (h: number) => void) => (e: LayoutChangeEvent) =>
  set(e.nativeEvent.layout.height);

/** Logo TikTok "thở" (phóng to/nhỏ + mờ dần) trong lúc chờ tải ảnh. */
function BreathingLogo({ size = 96 }: { size?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);

  return (
    <Animated.Image
      source={require("../../assets/icon.png")}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.23,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
        transform: [
          { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.12] }) },
        ],
      }}
    />
  );
}

function Empty({ error, height }: { error: string | null; height: number }) {
  return (
    <View style={[styles.empty, { height: height || undefined }]}>
      <Ionicons name="images-outline" size={54} color={colors.faint} />
      <Text style={styles.emptyTitle}>Chưa có ảnh</Text>
      <Text style={styles.emptyText}>
        {error ??
          (webConfigured
            ? "Tải ảnh lên từ bản web, ảnh sẽ hiện ở đây."
            : "Chưa cấu hình EXPO_PUBLIC_WEB_URL trong mobile/.env.")}
      </Text>
    </View>
  );
}

function TopBar({
  live,
  onToggleLive,
}: {
  live: boolean;
  onToggleLive: () => void;
}) {
  return (
    <View style={styles.topBar} pointerEvents="box-none">
      {/* Nút LIVE = công tắc chia sẻ camera. Bật → "LIVE" (đỏ), bấm để tắt → "OFF". */}
      <Pressable style={styles.live} onPress={onToggleLive} hitSlop={10}>
        <Ionicons
          name={live ? "radio" : "radio-outline"}
          size={20}
          color={live ? colors.red : "#fff"}
        />
        <Text style={[styles.liveText, live && styles.liveOn]}>
          {live ? "LIVE" : "OFF"}
        </Text>
      </Pressable>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.topTabs}
      >
        {TOP_TABS.map((t) => {
          const on = t === "Đề xuất";
          return (
            <View key={t} style={styles.topTab}>
              <Text style={[styles.topTabText, on && styles.topTabTextOn]}>{t}</Text>
              {on && <View style={styles.topTabUnderline} />}
            </View>
          );
        })}
      </ScrollView>

      <Ionicons name="search" size={24} color="#fff" />
    </View>
  );
}

function PostView({
  photo,
  index,
  height,
  headers,
}: {
  photo: Photo;
  index: number;
  height: number;
  headers: Record<string, string> | null;
}) {
  const [tapped, setTapped] = useState(false);
  // Ảnh gốc (nét) đã tải xong chưa. Chưa xong thì hiện thumb mờ + logo thở.
  const [ready, setReady] = useState(false);
  const meta = FAKE[index % FAKE.length];

  return (
    <Pressable style={[styles.post, { height }]} onPress={() => setTapped((t) => !t)}>
      {/* Nền: thumb phủ kín + làm mờ, lấp hai dải trống hai bên (kiểu TikTok). */}
      {photo.thumb ? (
        <Image source={{ uri: photo.thumb }} style={StyleSheet.absoluteFill} blurRadius={12} resizeMode="cover" />
      ) : null}
      {/* Ảnh gốc: contain → hiện TRỌN ảnh đúng tỉ lệ, không cắt. */}
      {headers && webConfigured && (
        <Image
          source={{ uri: photoUrl(photo.driveFileId), headers }}
          style={[StyleSheet.absoluteFill, !ready && styles.hidden]}
          resizeMode="contain"
          onLoad={() => setReady(true)}
          onError={() => setReady(true)}
        />
      )}

      {/* Loading cho tới khi ảnh gốc load xong (iOS tự cache nên lần sau tức thì). */}
      {!ready && (
        <View style={styles.loadingLayer} pointerEvents="none">
          <BreathingLogo size={60} />
        </View>
      )}

      {tapped && (
        <View style={styles.pausedLayer} pointerEvents="none">
          <View style={styles.pill}>
            <Ionicons name="scan-outline" size={16} color="#fff" />
            <Text style={styles.pillText}>Tìm kiếm hình ảnh này</Text>
            <Ionicons name="chevron-forward" size={14} color="#fff" />
          </View>
        </View>
      )}

      <ActionRail meta={meta} />
      <Caption meta={meta} />
    </Pressable>
  );
}

type Meta = (typeof FAKE)[number];

function ActionRail({ meta }: { meta: Meta }) {
  return (
    <View style={styles.rail}>
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={22} color="#fff" />
        </View>
        <View style={styles.follow}>
          <Ionicons name="add" size={14} color="#fff" />
        </View>
      </View>

      <RailButton icon="heart" count={meta.likes} />
      <RailButton icon="chatbubble-ellipses" count={meta.comments} />
      <RailButton icon="bookmark" count={meta.saves} tint={colors.red} />
      <RailButton icon="arrow-redo" count={meta.shares} />

      <View style={styles.disc}>
        <Ionicons name="musical-notes" size={18} color="#fff" />
      </View>
    </View>
  );
}

function RailButton({
  icon,
  count,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  count: number;
  tint?: string;
}) {
  return (
    <View style={styles.railBtn}>
      <Ionicons name={icon} size={33} color={tint ?? "#fff"} />
      <Text style={styles.railCount}>{formatCount(count)}</Text>
    </View>
  );
}

function Caption({ meta }: { meta: Meta }) {
  return (
    <View style={styles.caption} pointerEvents="none">
      <Text style={styles.author}>{meta.author}</Text>
      <Text style={styles.captionText}>
        {meta.caption}{" "}
        {meta.tags.map((t) => (
          <Text key={t} style={styles.tag}>
            #{t}{" "}
          </Text>
        ))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  post: { width: "100%", justifyContent: "flex-end", backgroundColor: "#111" },
  hidden: { opacity: 0 },
  loadingLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 32 },
  emptyTitle: { color: "#fff", fontSize: 20, fontWeight: "700" },
  emptyText: { color: colors.sub, fontSize: 14, textAlign: "center" },

  // Top bar
  topBar: {
    position: "absolute",
    top: inset.top,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  live: { flexDirection: "row", alignItems: "center", gap: 3 },
  liveText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  liveOn: { color: colors.red },
  topTabs: {
    alignItems: "center",
    gap: 18,
    paddingHorizontal: 8,
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  topTab: { alignItems: "center" },
  topTabText: { color: "rgba(255,255,255,0.7)", fontSize: 16, fontWeight: "600" },
  topTabTextOn: { color: "#fff", fontWeight: "700" },
  topTabUnderline: {
    marginTop: 5,
    width: 22,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: "#fff",
  },

  pausedLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(30,30,30,0.72)",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
  },
  pillText: { color: "#fff", fontSize: 14, fontWeight: "500" },

  // Action rail
  rail: { position: "absolute", right: 8, bottom: 96, alignItems: "center", gap: 18 },
  avatarWrap: { marginBottom: 6, alignItems: "center" },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#333",
    borderWidth: 1.5,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  follow: {
    position: "absolute",
    bottom: -9,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  railBtn: { alignItems: "center", gap: 3 },
  railCount: { color: "#fff", fontSize: 12, fontWeight: "600" },
  disc: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#1c1c1c",
    borderWidth: 6,
    borderColor: "#0c0c0c",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },

  // Caption
  caption: { position: "absolute", left: 12, right: 80, bottom: 40, gap: 6 },
  author: { color: "#fff", fontSize: 17, fontWeight: "700", fontStyle: "italic" },
  captionText: { color: "#fff", fontSize: 14, lineHeight: 19 },
  tag: { fontWeight: "600" },
});
