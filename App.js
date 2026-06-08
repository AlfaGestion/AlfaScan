import { StatusBar } from "expo-status-bar";
import { Text, TextInput } from "react-native";
import { UserProvider } from "@context/UserContext";
import { ThemeProvider, useThemeConfig } from "@context/ThemeContext";
import HomeStack from "@routes/homeStack"
import Colors from "@styles/Colors";
import { Fonts } from "@styles/Theme";

Text.defaultProps = Text.defaultProps || {};
Text.defaultProps.style = [{ fontFamily: Fonts.body, color: Colors.DGREY }, Text.defaultProps.style];
TextInput.defaultProps = TextInput.defaultProps || {};
TextInput.defaultProps.style = [{ fontFamily: Fonts.body, color: Colors.DGREY }, TextInput.defaultProps.style];

function AppContent() {
  const { darkMode } = useThemeConfig();

  return (
    <>
      <StatusBar style={darkMode ? "light" : "dark"} backgroundColor={darkMode ? "#16212D" : Colors.WHITE} />
      <HomeStack />
    </>
  );
}

const App = () => {
  return (
    <ThemeProvider>
      <UserProvider>
        <AppContent />
      </UserProvider>
    </ThemeProvider>
  );
};

export default App;
