import { StatusBar } from "expo-status-bar";
import { Component, useEffect } from "react";
import { Text, TextInput } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider, useThemeConfig } from "@context/ThemeContext";
import HomeStack from "@routes/homeStack"
import Colors from "@styles/Colors";
import { Fonts } from "@styles/Theme";

Text.defaultProps = Text.defaultProps || {};
Text.defaultProps.style = [{ fontFamily: Fonts.body, color: Colors.DGREY }, Text.defaultProps.style];
TextInput.defaultProps = TextInput.defaultProps || {};
TextInput.defaultProps.style = [{ fontFamily: Fonts.body, color: Colors.DGREY }, TextInput.defaultProps.style];

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[APP_ERROR]", error?.stack || error?.message || error);
    console.error("[APP_ERROR_INFO]", info?.componentStack || "");
  }

  render() {
    if (this.state.error) {
      return (
        <SafeAreaProvider>
          <Text style={{ padding: 16, color: Colors.DGREY }}>
            Error al iniciar la app.
          </Text>
        </SafeAreaProvider>
      );
    }

    return this.props.children;
  }
}

function AppContent() {
  const themeConfig = useThemeConfig() || {};
  const darkMode = Boolean(themeConfig.darkMode);

  return (
    <>
      <StatusBar style={darkMode ? "light" : "dark"} backgroundColor={darkMode ? "#16212D" : Colors.WHITE} />
      <HomeStack />
    </>
  );
}

const App = () => {
  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
};

export default App;
