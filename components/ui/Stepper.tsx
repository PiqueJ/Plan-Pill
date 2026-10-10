import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { colors, radius } from "../../constants/theme";
import AppText, { useTypeStyle } from "./AppText";
import { webNoOutline } from "./TextField";

type StepperProps = {
  label: string;
  required?: boolean;
  /** เก็บเป็นข้อความ เพราะผู้ใช้อาจลบจนช่องว่างระหว่างพิมพ์ */
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  error?: string | null;
};

/** ช่องตัวเลขแบบ − ค่า + ใช้กับจำนวนยาคงเหลือ พิมพ์เองก็ได้ กดปุ่มก็ได้ */
export default function Stepper({
  label,
  required,
  value,
  onChange,
  min = 0,
  max = 999,
  error,
}: StepperProps) {
  const numberStyle = useTypeStyle("itemTitle");
  const current = Number(value) || 0;

  function step(delta: number) {
    const next = Math.min(max, Math.max(min, current + delta));
    onChange(String(next));
  }

  return (
    <View style={styles.wrapper}>
      <AppText variant="label" color={colors.textSoft}>
        {label}
        {required ? <AppText variant="label" color={colors.danger}> *</AppText> : null}
      </AppText>
      <View style={[styles.box, error ? styles.error : null]}>
        <StepButton icon="minus" label={`ลด${label}`} onPress={() => step(-1)} disabled={current <= min} />
        <TextInput
          value={value}
          onChangeText={(text) => onChange(text.replace(/\D/g, "").slice(0, 3))}
          keyboardType="number-pad"
          accessibilityLabel={label}
          style={[
            styles.input,
            { fontFamily: numberStyle.fontFamily, fontSize: numberStyle.fontSize },
            Platform.OS === "web" && webNoOutline,
          ]}
        />
        <StepButton icon="plus" label={`เพิ่ม${label}`} onPress={() => step(1)} disabled={current >= max} />
      </View>
      {error ? (
        <AppText variant="meta" weight="semibold" color={colors.dangerText}>
          {`✕ ${error}`}
        </AppText>
      ) : null}
    </View>
  );
}

function StepButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: "minus" | "plus";
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.step, pressed && styles.stepPressed, disabled && styles.stepDisabled]}
    >
      <MaterialCommunityIcons name={icon} size={20} color={colors.tertiaryText} />
    </Pressable>
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
    padding: 4,
  },
  error: {
    borderColor: colors.danger,
  },
  input: {
    flex: 1,
    minWidth: 0,
    textAlign: "center",
    color: colors.text,
    paddingVertical: 8,
  },
  step: {
    width: 44,
    height: 44,
    borderRadius: radius.small,
    backgroundColor: colors.tertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepPressed: {
    backgroundColor: "#E1E9F2",
  },
  stepDisabled: {
    opacity: 0.4,
  },
});
