import { View, Text, StyleSheet } from "react-native";
import Constants from "expo-constants";

import Colors from "@styles/Colors";
import { Fonts, Radii, Shadow } from "@styles/Theme";
import { useThemeConfig } from "@context/ThemeContext";

export default function AboutScreen() {
  const { darkMode } = useThemeConfig();

  const theme = {
    background: darkMode ? "#0F1720" : "#E8F2FC",
    surface: darkMode ? "#16212D" : Colors.SURFACE,
    text: darkMode ? "#E8F0F8" : Colors.DGREY,
    muted: darkMode ? "#BFD0E0" : Colors.MUTED,
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={[styles.card, { backgroundColor: theme.surface }, Shadow.sm]}>
        <Text style={[styles.title, { color: theme.text }]}>AlfaScan</Text>
        <Text style={[styles.line, { color: theme.muted }]}>
          Aplicación de búsqueda, impresión y sincronización para dispositivos Sunmi.
        </Text>
        <Text style={[styles.line, { color: theme.text }]}>
          Versión: {Constants.expoConfig?.version ?? "1.0.0"}
        </Text>
        <Text style={[styles.line, { color: theme.text }]}>
          Motor: React Native / Expo
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 16,
  },
  card: {
    borderRadius: Radii.xl,
    padding: 18,
  },
  title: {
    fontSize: 22,
    fontFamily: Fonts.display,
    marginBottom: 8,
  },
  line: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.body,
    marginBottom: 8,
  },
});
