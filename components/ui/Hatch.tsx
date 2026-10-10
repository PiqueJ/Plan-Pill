import { ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { radius } from "../../constants/theme";

// แท่งละ 7 จุด ต้องกว้างรวมเกิน 900 เพื่อให้คลุมกล่องได้ทุกขนาดหลังหมุน 45°
const STRIPE_COUNT = 130;

/**
 * พื้นลายทางเฉียงพร้อมขอบประ ใช้กับสิ่งที่ "ยังไม่รู้" เท่านั้น
 *
 * เช่น ยังไม่ได้ตรวจปฏิกิริยา หรือโหลดข้อมูลใหม่ไม่สำเร็จ
 * ตั้งใจให้หน้าตาต่างจากทั้งกล่องปลอดภัย (ฟ้า) และกล่องเตือน (ส้ม แดง)
 * ผู้ใช้จะได้ไม่เข้าใจผิดว่าไม่มีคำเตือนแปลว่าปลอดภัย
 *
 * วาดลายด้วยแท่งเอียงหลายแท่ง เพราะ React Native ไม่มีพื้นลายซ้ำแบบ CSS
 */
export default function Hatch({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.box, style]}>
      <View pointerEvents="none" style={styles.stripes}>
        {Array.from({ length: STRIPE_COUNT }, (_, index) => (
          <View key={index} style={[styles.stripe, index % 2 === 1 && styles.stripeDark]} />
        ))}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    overflow: "hidden",
    borderRadius: radius.field,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#7C8798",
    backgroundColor: "#EEF2F6",
  },
  stripes: {
    position: "absolute",
    top: -300,
    left: -200,
    width: 900,
    height: 900,
    flexDirection: "row",
    transform: [{ rotate: "45deg" }],
  },
  stripe: {
    width: 7,
    height: "100%",
    backgroundColor: "#EEF2F6",
  },
  stripeDark: {
    backgroundColor: "#E4E9EF",
  },
});
