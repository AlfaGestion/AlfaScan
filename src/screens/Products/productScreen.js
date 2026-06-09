import { useEffect, useLayoutEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { currencyFormat } from "@libraries/utils";

import { productScreenStyles } from "@styles/ProductStyle";

import ItemLineTextValue from "@components/ItemLineTextValue";

import Product from "@db/Product";
import { Entypo } from "@expo/vector-icons";
import ProductImage from "../../components/ProductImage";
import Configuration from "@db/Configuration";
import { useThemeConfig } from "@context/ThemeContext";
import Ionicons from "@expo/vector-icons/Ionicons";

export default function ProductScreen({ navigation, route }) {
  const [productInfo, setProductInfo] = useState([]);
  const [cargaImagenes, setCargaImagenes] = useState(false);
  const [useStockColumn, setUseStockColumn] = useState(false);
  const [reloadImage, setReloadImage] = useState(false);
  const { darkMode } = useThemeConfig();

  const { id: productId = null } = route?.params || {};

  const loadConfiguration = async () => {
    try {
      await Configuration.createTable();
      const value = await Configuration.getConfigValue("CARGA_IMAGENES");
      const stockValue =
        (await Configuration.getConfigValue("SQL_USE_STOCK_COLUMN")) ??
        (await Configuration.getConfigValue("SQL_USE_STOCK"));
      setCargaImagenes(value == "1");
      setUseStockColumn(stockValue == "1");
    } catch (e) {
      setCargaImagenes(false);
      setUseStockColumn(false);
    }
  };

  const loadProduct = async () => {
    const data = await Product.find(parseInt(productId));
    setProductInfo(data);
  };

  useEffect(() => {
    loadConfiguration();
    loadProduct();
  }, [route?.params]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerStyle: { backgroundColor: darkMode ? "#16212D" : "#DDEAF8" },
      headerTintColor: darkMode ? "#E8F0F8" : "#1A395A",
      headerTitleStyle: { color: darkMode ? "#E8F0F8" : "#1A395A", fontWeight: "700" },
    });
  }, [navigation, darkMode]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: darkMode ? "#0F1720" : "#FFFFFF" }}>
      <ScrollView style={{ backgroundColor: darkMode ? "#0F1720" : "#FFFFFF" }}>
        <View style={[productScreenStyles.mainContainer, darkMode && { backgroundColor: "#0F1720" }]}>
          {productInfo && (
            <ProductImage
              reload={reloadImage}
              fileName={productInfo?.code}
              widthImage={150}
              heightImage={150}
              cancelaCarga={!cargaImagenes}
            />
          )}
          <View style={[productScreenStyles.container]}>
            <Text style={[productScreenStyles.innerText, darkMode && { color: "#E8F0F8" }]}>{productInfo?.name?.trim()}</Text>

            <Text style={[productScreenStyles.title, darkMode && { color: "#BFD0E0" }]}># {productInfo?.code}</Text>

            {cargaImagenes && (
              <TouchableOpacity
                style={[productScreenStyles.buttonReloadImage, darkMode && { backgroundColor: "#244A72" }]}
                onPress={async () => {
                  setReloadImage(true);
                  setTimeout(() => {
                    setReloadImage(false);
                  });
                }}
              >
                <Ionicons name="reload" size={24} color="white" />
                <Text style={{ color: "white" }}> Recargar imagen</Text>
              </TouchableOpacity>
            )}

            {useStockColumn && (
              <TouchableOpacity
                style={[productScreenStyles.buttonModifyStock, darkMode && { backgroundColor: "#188B78" }]}
                onPress={() =>
                  navigation.navigate("ProductStockScreen", {
                    code: productInfo?.code,
                    name: productInfo?.name,
                  })
                }
              >
                <Entypo name="box" size={24} color="white" />
                <Text style={[productScreenStyles.textButton]}>Consultar stock</Text>
              </TouchableOpacity>
            )}

            <ItemLineTextValue text="Iva" value={productInfo?.iva} tabs="                " darkMode={darkMode} />
            <ItemLineTextValue text="Codigo de barras" value={productInfo?.codigoBarras ? productInfo?.codigoBarras : "No informado"} tabs="     " darkMode={darkMode} />
            <ItemLineTextValue text="Codigo barra 1" value={productInfo?.codigoBarra1 ? productInfo?.codigoBarra1 : "No informado"} tabs="     " darkMode={darkMode} />
            <ItemLineTextValue text="Codigo barra 2" value={productInfo?.codigoBarra2 ? productInfo?.codigoBarra2 : "No informado"} tabs="     " darkMode={darkMode} />
            <ItemLineTextValue text="Codigo barra 3" value={productInfo?.codigoBarra3 ? productInfo?.codigoBarra3 : "No informado"} tabs="     " darkMode={darkMode} />
            <ItemLineTextValue text="Codigo barra 4" value={productInfo?.codigoBarra4 ? productInfo?.codigoBarra4 : "No informado"} tabs="     " darkMode={darkMode} />
            <ItemLineTextValue text="Codigo barra DUN" value={productInfo?.codigoBarraDun ? productInfo?.codigoBarraDun : "No informado"} tabs="     " darkMode={darkMode} />

            <ItemLineTextValue text="Precio1" value={currencyFormat(productInfo?.price1)} tabs="      " darkMode={darkMode} />
            <ItemLineTextValue text="Precio2" value={currencyFormat(productInfo?.price2)} tabs="      " darkMode={darkMode} />
            <ItemLineTextValue text="Precio3" value={currencyFormat(productInfo?.price3)} tabs="      " darkMode={darkMode} />
            <ItemLineTextValue text="Precio4" value={currencyFormat(productInfo?.price4)} tabs="      " darkMode={darkMode} />
            <ItemLineTextValue text="Precio5" value={currencyFormat(productInfo?.price5)} tabs="      " darkMode={darkMode} />
            <ItemLineTextValue text="Precio6" value={currencyFormat(productInfo?.price6)} tabs="      " darkMode={darkMode} />
            <ItemLineTextValue text="Precio7" value={currencyFormat(productInfo?.price7)} tabs="      " darkMode={darkMode} />
            <ItemLineTextValue text="Precio8" value={currencyFormat(productInfo?.price8)} tabs="      " darkMode={darkMode} />
            <ItemLineTextValue text="Precio9" value={currencyFormat(productInfo?.price9)} tabs="      " darkMode={darkMode} />
            <ItemLineTextValue text="Precio10" value={currencyFormat(productInfo?.price10)} tabs="    " darkMode={darkMode} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
