import { Text, TextProps, TextStyle } from "react-native";
import { FontWeightName, TypeVariant, colors, font, typeScale } from "../../constants/theme";
import { useFontScale } from "./FontScale";

type AppTextProps = TextProps & {
  variant?: TypeVariant;
  color?: string;
  /** แทนน้ำหนักตั้งต้นของ variant */
  weight?: FontWeightName;
  align?: TextStyle["textAlign"];
};

/** สไตล์ตัวอักษรที่คูณขนาดตามที่ผู้ใช้ตั้งไว้แล้ว ใช้กับ TextInput ที่ห่อด้วย AppText ไม่ได้ */
export function useTypeStyle(variant: TypeVariant, weight?: FontWeightName): TextStyle {
  const { scale } = useFontScale();
  const spec = typeScale[variant];

  return {
    fontFamily: font[weight ?? spec.weight],
    fontSize: spec.fontSize * scale,
    lineHeight: spec.lineHeight * scale,
    letterSpacing: "letterSpacing" in spec ? spec.letterSpacing : undefined,
  };
}

/**
 * ตัวอักษรทั้งแอปต้องผ่านคอมโพเนนต์นี้
 *
 * ใส่ฟอนต์ ขนาด ระยะบรรทัด และตัวคูณขนาดตัวอักษรให้ครบในที่เดียว
 * กันปัญหาลืมใส่ fontFamily ซึ่งบนเว็บจะกลายเป็นฟอนต์ระบบทันที
 */
export default function AppText({
  variant = "body",
  color = colors.text,
  weight,
  align,
  style,
  ...rest
}: AppTextProps) {
  const typeStyle = useTypeStyle(variant, weight);

  return (
    <Text
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[typeStyle, { color, textAlign: align }, style]}
    />
  );
}
