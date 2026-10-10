import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Platform, Pressable, StyleProp, StyleSheet, TextInput, View, ViewStyle } from "react-native";
import { colors, radius } from "../../constants/theme";
import { useTypeStyle } from "./AppText";
import { webNoOutline } from "./TextField";

/** ช่องค้นหาในรายการ มีแว่นขยายด้านซ้ายและปุ่มล้างคำค้นด้านขวา */
export default function SearchField({
  value,
  onChangeText,
  placeholder,
  style,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  style?: StyleProp<ViewStyle>;
}) {
  const type = useTypeStyle("body");

  return (
    <View style={[styles.box, style]}>
      <MaterialCommunityIcons name="magnify" size={20} color={colors.placeholder} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        autoCorrect={false}
        style={[
          styles.input,
          { fontFamily: type.fontFamily, fontSize: type.fontSize },
          Platform.OS === "web" && webNoOutline,
        ]}
      />
      {value ? (
        <Pressable
          onPress={() => onChangeText("")}
          accessibilityRole="button"
          accessibilityLabel="ล้างคำค้นหา"
          hitSlop={10}
          style={styles.clear}
        >
          <MaterialCommunityIcons name="close-circle" size={18} color={colors.placeholder} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 50,
    backgroundColor: colors.surface,
    borderRadius: radius.field,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    color: colors.text,
  },
  clear: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
