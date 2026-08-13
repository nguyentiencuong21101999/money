import { Pressable, StyleSheet, View } from "react-native";
import { colors } from "./theme";

/**
 * Nút gạt tự vẽ, thay cho <Switch> của RN — Switch iOS render lỗi (núm lòi ra
 * ngoài track) khi set đồng thời thumbColor + ios_backgroundColor + trackColor.
 * Tự vẽ thì hình dạng chắc chắn, khớp tông đen/đỏ của app.
 */
export function Toggle({
  value,
  onValueChange,
  disabled,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      hitSlop={8}
      style={[
        styles.track,
        { backgroundColor: value ? colors.red : "#3a3a3a" },
        disabled && { opacity: 0.5 },
      ]}
    >
      <View style={[styles.knob, value ? styles.knobOn : styles.knobOff]} />
    </Pressable>
  );
}

const TRACK_W = 52;
const TRACK_H = 32;
const KNOB = 28;

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    justifyContent: "center",
  },
  knob: {
    position: "absolute",
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  knobOff: { left: 2 },
  knobOn: { right: 2 },
});
