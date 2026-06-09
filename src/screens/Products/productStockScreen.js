import { useEffect, useLayoutEffect, useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import SafeAreaView from "react-native-safe-area-view";

import Product from "@db/Product";
import Configuration from "@db/Configuration";
import iconStock from "@icons/stock.png";
import { currencyFormat } from "@libraries/utils";
import { useThemeConfig } from "@context/ThemeContext";
import { stockScreenStyles } from "@styles/ProductStyle";

export default function ProductStockScreen({ navigation, route }) {
  const { code = null, name = null } = route?.params || {};

  const [isEmpty, setIsEmpty] = useState(false);
  const [productInfo, setProductInfo] = useState(null);
  const [statusResponse, setStatusResponse] = useState("");
  const [useStockColumn, setUseStockColumn] = useState(false);
  const { darkMode } = useThemeConfig();

  async function loadStockConfig() {
    try {
      await Configuration.createTable();
      const stockValue =
        (await Configuration.getConfigValue("SQL_USE_STOCK_COLUMN")) ??
        (await Configuration.getConfigValue("SQL_USE_STOCK"));
      return stockValue == "1";
    } catch (error) {
      return false;
    }
  }

  async function loadProductStock(stockEnabled = useStockColumn) {
    try {
      if (!stockEnabled) {
        setProductInfo(null);
        setIsEmpty(true);
        setStatusResponse("Stock desactivado en la configuración");
        return;
      }

      const rows = await Product.findByCode(String(code ?? ""), "");
      const nextProduct = Array.isArray(rows) ? rows[0] ?? null : null;

      if (!nextProduct) {
        setProductInfo(null);
        setIsEmpty(true);
        setStatusResponse("No hay información disponible");
        return;
      }

      setProductInfo(nextProduct);
      setIsEmpty(false);
    } catch (error) {
      setProductInfo(null);
      setIsEmpty(true);
      setStatusResponse(error?.message || "No se pudo consultar el stock");
    }
  }

  useEffect(() => {
    (async () => {
      const stockEnabled = await loadStockConfig();
      setUseStockColumn(stockEnabled);
      await loadProductStock(stockEnabled);
    })();
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerStyle: { backgroundColor: darkMode ? "#16212D" : "#DDEAF8" },
      headerTintColor: darkMode ? "#E8F0F8" : "#1A395A",
      headerTitleStyle: { color: darkMode ? "#E8F0F8" : "#1A395A", fontWeight: "700" },
    });
  }, [navigation, darkMode]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: darkMode ? "#0F1720" : "#FFFFFF" }}>
      <View style={[stockScreenStyles.container, darkMode && styles.containerDark]}>
        <View>
          <Image style={[stockScreenStyles.image]} source={iconStock} />
        </View>
        <View style={[stockScreenStyles.containerTitle]}>
          <Text style={[stockScreenStyles.title, darkMode && styles.titleDark]}>Ficha de stock # {code}</Text>
          <Text style={[stockScreenStyles.titleName, darkMode && styles.titleNameDark]}>{name?.trim()}</Text>
        </View>

        {productInfo ? (
          <View style={[styles.stockCard, darkMode && styles.stockCardDark]}>
            <Text style={[styles.stockLabel, darkMode && styles.stockLabelDark]}>Stock disponible</Text>
            <Text style={[styles.stockValue, darkMode && styles.stockValueDark]}>{productInfo?.stock ?? 0}</Text>
            <Text style={[styles.detailText, darkMode && styles.detailTextDark]}>
              Precio: {currencyFormat(productInfo?.precio ?? productInfo?.price1 ?? 0)}
            </Text>
            {productInfo?.fechaActualizacion ? (
              <Text style={[styles.detailText, darkMode && styles.detailTextDark]}>
                Actualizado: {productInfo.fechaActualizacion}
              </Text>
            ) : null}
          </View>
        ) : isEmpty ? (
          <Text style={[stockScreenStyles.labelError]}>{statusResponse}</Text>
        ) : (
          <ActivityIndicator style={[stockScreenStyles.loader]} size="large" color={darkMode ? "#8FC3FF" : "#00aa00"} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = {
  containerDark: {
    flex: 1,
    backgroundColor: "#0F1720",
  },
  titleDark: {
    color: "#BFD0E0",
  },
  titleNameDark: {
    color: "#E8F0F8",
  },
  stockCard: {
    marginTop: 16,
    width: "100%",
    borderRadius: 16,
    padding: 18,
    backgroundColor: "#F7FBFF",
    borderWidth: 1,
    borderColor: "#D8E5F2",
  },
  stockCardDark: {
    backgroundColor: "#152332",
    borderColor: "#2D4154",
  },
  stockLabel: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
    color: "#56708B",
    fontWeight: "700",
  },
  stockLabelDark: {
    color: "#9CB2C8",
  },
  stockValue: {
    fontSize: 36,
    fontWeight: "800",
    color: "#1A395A",
    marginBottom: 8,
  },
  stockValueDark: {
    color: "#E8F0F8",
  },
  detailText: {
    fontSize: 14,
    color: "#475A6F",
    marginTop: 4,
  },
  detailTextDark: {
    color: "#BFD0E0",
  },
};
