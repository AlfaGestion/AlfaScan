import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ImageBackground, StyleSheet, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import Configuration from "@db/Configuration";

SplashScreen.preventAutoHideAsync().catch(() => {});

const ThemeContext = createContext({
  darkMode: false,
  themeLoaded: false,
  refreshTheme: async () => {},
});

function ThemeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(false);
  const [themeLoaded, setThemeLoaded] = useState(false);

  const refreshTheme = async () => {
    try {
      await Configuration.createTable();
      const value = await Configuration.getConfigValue("TEMA_OSCURO");
      setDarkMode(Configuration.isTruthyConfigValue(value));
    } catch (e) {
      setDarkMode(false);
    } finally {
      setThemeLoaded(true);
    }
  };

  useEffect(() => {
    refreshTheme();
  }, []);

  useEffect(() => {
    if (themeLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [themeLoaded]);

  const value = useMemo(() => ({
    darkMode,
    themeLoaded,
    refreshTheme,
  }), [darkMode, themeLoaded]);

  if (!themeLoaded) {
    return (
      <View style={styles.root}>
        <ImageBackground
          source={require("../../assets/splashDark.png")}
          style={styles.splash}
          imageStyle={styles.splashImage}
          resizeMode="cover"
        />
      </View>
    );
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useThemeConfig() {
  return useContext(ThemeContext);
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0F1720",
  },
  splash: {
    flex: 1,
    backgroundColor: "#0F1720",
    justifyContent: "center",
    alignItems: "center",
  },
  splashImage: {
    width: "100%",
    height: "100%",
  },
});

export { ThemeProvider, useThemeConfig };
