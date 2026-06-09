import { Image, Text, StyleSheet, View } from "react-native";
import Colors from "@styles/Colors";
import { Fonts } from "@styles/Theme";

import alfaLogo from "../../assets/alfa_logo.png";

export default function BrandMark({
  label = "AlfaScan",
  size = 72,
  logoSource = alfaLogo,
  darkMode = false,
}) {
  return (
    <View style={styles.container}>
      <Image
        source={logoSource}
        style={{
          width: size,
          height: size,
        }}
        resizeMode="contain"
      />

      <Text style={[styles.label, darkMode && styles.labelDark]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },

  label: {
    marginTop: 2,
    fontFamily: Fonts.display,
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 0.1,
    color: Colors.DGREY,
  },

  labelDark: {
    color: "#E8F0F8",
  },
});