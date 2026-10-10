import { ReactNode, Ref, useState } from "react";
import { Platform, StyleProp, StyleSheet, TextInput, TextInputProps, TextStyle, View, ViewStyle } from "react-native";
import { colors, radius } from "../../constants/theme";
import AppText, { useTypeStyle } from "./AppText";

/** ตัดเส้นกรอบที่เบราว์เซอร์ใส่ให้ตอนโฟกัส เพราะช่องวาดวงแสงของตัวเองแล้ว */
export const webNoOutline = { outlineStyle: "none" } as unknown as TextStyle;

type TextFieldProps = Omit<TextInputProps, "style"> & {
  label?: string;
  required?: boolean;
  /** ข้อความผิดพลาด แสดงแทน helper และเปลี่ยนขอบเป็นสีแดง */
  error?: string | null;
  helper?: string;
  /** ของที่วางชิดขวาในช่อง เช่น ปุ่ม "ดู" หรือป้าย "พบในฐานข้อมูล" */
  right?: ReactNode;
  inputRef?: Ref<TextInput>;
  style?: StyleProp<ViewStyle>;
  /** ตัวหนังสือในช่องเป็นตัวหนา ใช้กับค่าที่ระบบยืนยันแล้ว เช่น ชื่อยาที่เลือกจากรายการ */
  strong?: boolean;
};

/**
 * ช่องกรอกตาม Build Kit: ปกติ · กำลังพิมพ์ (ขอบฟ้า + วงแสง) · ผิด (ขอบแดง + ✕ ข้อความ)
 *
 * ข้อความผิดพลาดบอกวิธีแก้เสมอ เช่น "อีเมลยังไม่ครบ เช่น somchai@gmail.com"
 */
export default function TextField({
  label,
  required,
  error,
  helper,
  right,
  inputRef,
  style,
  strong,
  onFocus,
  onBlur,
  multiline,
  ...inputProps
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const inputType = useTypeStyle("body", strong ? "semibold" : "regular");

  return (
    <View style={[styles.wrapper, style]}>
      {label ? (
        <AppText variant="label" color={colors.textSoft}>
          {label}
          {required ? <AppText variant="label" color={colors.danger}> *</AppText> : null}
        </AppText>
      ) : null}

      <View
        style={[
          styles.box,
          right ? styles.boxWithRight : null,
          focused && styles.focused,
          error ? styles.error : null,
        ]}
      >
        <TextInput
          ref={inputRef}
          placeholderTextColor={colors.placeholder}
          {...inputProps}
          multiline={multiline}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            styles.input,
            // ไม่ใส่ lineHeight กับช่องบรรทัดเดียว เพราะ iOS จะดันตัวอักษรให้ไม่อยู่กลางช่อง
            { fontFamily: inputType.fontFamily, fontSize: Number(inputType.fontSize) + 1 },
            multiline && [styles.multiline, { lineHeight: inputType.lineHeight }],
            Platform.OS === "web" && webNoOutline,
          ]}
        />
        {right}
      </View>

      {error ? (
        <AppText variant="meta" weight="semibold" color={colors.dangerText}>
          {`✕ ${error}`}
        </AppText>
      ) : helper ? (
        <AppText variant="meta" color={colors.textMuted}>
          {helper}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  box: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.inputBorder,
    borderRadius: radius.field,
    minHeight: 54,
  },
  boxWithRight: {
    paddingRight: 5,
  },
  focused: {
    borderColor: colors.primary,
    boxShadow: `0 0 0 4px ${colors.primaryTint}`,
  },
  error: {
    borderColor: colors.danger,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: colors.text,
  },
  multiline: {
    minHeight: 84,
    textAlignVertical: "top",
  },
});
