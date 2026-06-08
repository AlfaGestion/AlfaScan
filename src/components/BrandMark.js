import { Image, Text, StyleSheet, View } from "react-native";
import Colors from "@styles/Colors";
import { Fonts, Shadow } from "@styles/Theme";

import alfaLogo from "../../assets/icon.png";

export default function BrandMark({ label = "AlfaScan", size = 64, logoSource = alfaLogo, darkMode = false }) {
  const logoSize = size;

  return (
    <View style={styles.container}>
      <Image
        source={logoSource}
        style={[styles.logo, { width: logoSize, height: logoSize }]}
        resizeMode="contain"
      />
      <Text style={[styles.label, darkMode && styles.labelDark]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  logo: {
    borderRadius: 999,
    backgroundColor: Colors.SURFACE,
    padding: 6,
    ...Shadow.sm,
  },
  label: {
    marginTop: 12,
    fontFamily: Fonts.display,
    fontSize: 20,
    color: Colors.DGREY,
  },
  labelDark: {
    color: "#E8F0F8",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
