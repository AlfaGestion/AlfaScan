import { StatusBar } from "expo-status-bar";
import { Text, TextInput } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider, useThemeConfig } from "@context/ThemeContext";
import HomeStack from "@routes/homeStack"
import Colors from "@styles/Colors";
import { Fonts } from "@styles/Theme";
import useCatalogSyncScheduler from "@hooks/useCatalogSyncScheduler";

Text.defaultProps = Text.defaultProps || {};
Text.defaultProps.style = [{ fontFamily: Fonts.body, color: Colors.DGREY }, Text.defaultProps.style];
TextInput.defaultProps = TextInput.defaultProps || {};
TextInput.defaultProps.style = [{ fontFamily: Fonts.body, color: Colors.DGREY }, TextInput.defaultProps.style];

function AppContent() {
  const { darkMode } = useThemeConfig();
  useCatalogSyncScheduler();

  return (
    <>
      <StatusBar style={darkMode ? "light" : "dark"} backgroundColor={darkMode ? "#16212D" : Colors.WHITE} />
      <HomeStack />
    </>
  );
}

const App = () => {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
};

export default App;
