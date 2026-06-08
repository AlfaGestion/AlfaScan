import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";

import AboutScreen from "@screens/AboutScreen";
import ConfigurationScreen from "@screens/configurationScreen";
import HomeScreen from "@screens/homeScreen";
import PrintHistoryScreen from "@screens/PrintHistoryScreen";
import ProductsScreen from "@screens/Products/listProductsScreen";
import ProductScreen from "@screens/Products/productScreen";
import ProductStockScreen from "@screens/Products/productStockScreen";
import SyncScreen from "@screens/Sync/SyncScreen";
import Colors from "@styles/Colors";
import { Fonts } from "@styles/Theme";
import { useThemeConfig } from "@context/ThemeContext";

const Stack = createStackNavigator();

const HomeStack = () => {
  const { darkMode } = useThemeConfig();

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="HomeScreen"
        screenOptions={{
          headerTintColor: darkMode ? "#E8F0F8" : Colors.DGREY,
          headerStyle: { backgroundColor: darkMode ? "#16212D" : Colors.SURFACE },
          headerTitleStyle: {
            fontFamily: Fonts.display,
            letterSpacing: 0.4,
            color: darkMode ? "#E8F0F8" : Colors.DGREY,
          },
        }}
      >
        <Stack.Screen
          name="HomeScreen"
          component={HomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ConfigurationScreen"
          component={ConfigurationScreen}
          options={{ title: "Configuración" }}
        />
        <Stack.Screen
          name="SyncScreen"
          component={SyncScreen}
          options={{ title: "Sincronización" }}
        />
        <Stack.Screen
          name="ProductsScreen"
          component={ProductsScreen}
          options={{ title: "Productos" }}
        />
        <Stack.Screen
          name="ProductScreen"
          component={ProductScreen}
          options={{ title: "Ficha de artículo" }}
        />
        <Stack.Screen
          name="ProductStockScreen"
          component={ProductStockScreen}
          options={{ title: "Consulta de stock" }}
        />
        <Stack.Screen
          name="PrintHistoryScreen"
          component={PrintHistoryScreen}
          options={{ title: "Historial de impresiones" }}
        />
        <Stack.Screen
          name="AboutScreen"
          component={AboutScreen}
          options={{ title: "Acerca de / versión" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default HomeStack;
