import { useEffect, useState, useRef, useLayoutEffect, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Text,
  TextInput,
  View,
  TouchableOpacity,
  Modal as RNModal,
  StyleSheet,
  Alert,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import Ionicons from "@expo/vector-icons/Ionicons";

import ProductItem from "@components/ProductItem";
import Product from "@db/Product";
import { listProductsStyles } from "@styles/ProductStyle";
import Colors from "@styles/Colors";
import Configuration from "@db/Configuration";
import { useThemeConfig } from "@context/ThemeContext";
import { scanSearchArticle } from "@services/articleService";
import iconProduct from "@icons/articulos.png";
import iconProductDark from "@icons/articulos_b.png";

export default function Products({ navigation }) {
  const PAGE_SIZE = 50;
  const [products, setProducts] = useState([]);
  const [empty, setEmpty] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [loadImages, setLoadImages] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [productsLimit, setProductsLimit] = useState(PAGE_SIZE);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [cfgCodPesable, setCfgCodPesable] = useState("");
  const [cfgDecimalesEan, setCfgDecimalesEan] = useState(0);
  const { darkMode } = useThemeConfig();

  const [permission, requestPermission] = useCameraPermissions();
  const [scannerVisible, setScannerVisible] = useState(false);
  const [cameraMounted, setCameraMounted] = useState(false);
  const [cameraSlow, setCameraSlow] = useState(false);

  const refInput = useRef();
  const scanningRef = useRef(false);
  const cameraMountTimerRef = useRef(null);
  const cameraWarningTimerRef = useRef(null);
  const cameraOpenRequestedAtRef = useRef(0);
  const lastScanRef = useRef({ code: "", at: 0 });

  useEffect(() => {
    loadConfiguration();
    loadProducts("", false, PAGE_SIZE);
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerStyle: { backgroundColor: darkMode ? "#16212D" : "#DDEAF8" },
      headerTintColor: darkMode ? "#E8F0F8" : "#1A395A",
      headerTitleStyle: { color: darkMode ? "#E8F0F8" : "#1A395A", fontWeight: "700" },
    });
  }, [navigation, darkMode]);

  useEffect(() => {
    Product.ensureIndexes().catch(() => {});
  }, []);

  const loadConfiguration = async () => {
    try {
      await Configuration.createTable();
      const imagesValue = await Configuration.getConfigValue("CARGA_IMAGENES");
      const codPesableCfg = await Configuration.getConfigValue("CfgCodPesable");
      const codPesableLegacy = await Configuration.getConfigValue("CodPesable");
      const decimalesCfg = await Configuration.getConfigValue("cfgDecimalesEan");
      const decimalesLegacy = await Configuration.getConfigValue("DecimalesEan");
      setLoadImages(imagesValue == "1");
      setCfgCodPesable(String(codPesableCfg || codPesableLegacy || "").trim().toUpperCase());
      setCfgDecimalesEan(Math.max(0, parseInt(decimalesCfg || decimalesLegacy, 10) || 0));
    } catch (e) {
      setLoadImages(false);
      setCfgCodPesable("");
      setCfgDecimalesEan(0);
    }
  };

  const getWeightedQuantityFromScan = (mode, decimals, rawValue, product) => {
    const value = parseInt(String(rawValue ?? ""), 10);
    if (!Number.isFinite(value)) return null;
    const divisor = Math.pow(10, Math.max(0, Number(decimals) || 0) + 1);
    const parsedValue = divisor > 0 ? value / divisor : value;

    if (mode === "P" || mode === "Q") {
      return parsedValue;
    }

    if (mode === "T") {
      const unitPrice = parseFloat(product?.price1 ?? 0);
      if (!unitPrice) return null;
      return parsedValue / unitPrice;
    }

    return null;
  };

  const parseWeightedCodeByMask = (rawCode) => {
    let code = String(rawCode ?? "").trim();
    const mask = String(cfgCodPesable ?? "").trim().toUpperCase();
    if (mask && code.length === mask.length - 1 && mask.startsWith("0") && !code.startsWith("0")) {
      code = `0${code}`;
    }
    if (!code || !mask || code.length < mask.length) {
      return null;
    }

    const maskedCode = code.slice(0, mask.length);
    let lookupCode = "";
    let valueDigits = "";
    let valueMode = "";

    for (let i = 0; i < mask.length; i++) {
      const maskChar = mask[i];
      const codeChar = maskedCode[i];

      if (["C", "P", "Q", "T"].includes(maskChar)) {
        if (maskChar === "C") {
          lookupCode += codeChar;
        } else {
          valueDigits += codeChar;
          if (!valueMode) valueMode = maskChar;
        }
        continue;
      }

      if (maskChar !== codeChar) {
        return null;
      }
    }

    if (!lookupCode) {
      return null;
    }

    if (mask === "0CCCCCPPPPPP") {
      return {
        lookupCode: maskedCode.slice(1, 6),
        valueDigits: maskedCode.slice(6, 12),
        valueMode: "P",
      };
    }

    return { lookupCode, valueDigits, valueMode };
  };

  const findProductsByScannedCode = async (rawValue) => {
    const rawCode = String(rawValue ?? "").trim();
    const mask = String(cfgCodPesable ?? "").trim().toUpperCase();
    const codeVariants = Array.from(new Set([
      rawCode,
      (/^[0-9]+$/.test(rawCode) && !rawCode.startsWith("0")) ? `0${rawCode}` : null,
      (/^[0-9]+$/.test(rawCode) && mask.startsWith("0") && rawCode.length === Math.max(1, mask.length - 1)) ? `0${rawCode}` : null,
      (/^[0-9]+$/.test(rawCode) && mask.startsWith("0") && rawCode.length === mask.length) ? `0${rawCode}` : null,
    ].filter(Boolean)));

    for (const candidateCode of codeVariants) {
      const data = await Product.findByCode(candidateCode, "");
      if (data && data.length > 0) {
        return { data, resolvedCode: candidateCode, qtyOverride: null };
      }
    }

    for (const candidateCode of codeVariants) {
      const parsed = parseWeightedCodeByMask(candidateCode);
      if (!parsed) continue;

      const lookupVariants = Array.from(new Set([
        String(parsed.lookupCode ?? "").trim(),
        String(parsed.lookupCode ?? "").trim().replace(/^0+/, ""),
      ].filter(Boolean)));

      for (const lookupCode of lookupVariants) {
        const data = await Product.findByCode(lookupCode, "");
        if (data && data.length > 0) {
          const selected = data[0];
          const qtyOverride = getWeightedQuantityFromScan(parsed.valueMode, cfgDecimalesEan, parsed.valueDigits, selected);
          return { data, resolvedCode: lookupCode, qtyOverride };
        }
      }
    }

    return { data: [], resolvedCode: rawCode, qtyOverride: null };
  };

  const loadProducts = async (text = "", isSearch = false, requestedLimit = PAGE_SIZE) => {
    let data = [];
    setIsLoading(true);
    setSearchText(text);

    try {
      const fetchLimit = requestedLimit + 1;
      if (isSearch && text !== "") {
        const exactMatch = await findProductsByScannedCode(text);
        data = exactMatch.data;
        if (exactMatch.resolvedCode !== text) {
          setSearchText(exactMatch.resolvedCode);
        }
        if (!data || data.length === 0) {
          data = await Product.findLikeName(text, 1, fetchLimit);
        }
      } else {
        data = await Product.query({ page: 1, limit: fetchLimit });
      }

      if (!data || data.length === 0) {
        setEmpty(true);
        setProducts([]);
        setHasMoreProducts(false);
        setProductsLimit(requestedLimit);
      } else {
        const visibleProducts = data.slice(0, requestedLimit);
        setEmpty(false);
        setProducts(visibleProducts);
        setHasMoreProducts(data.length > requestedLimit);
        setProductsLimit(requestedLimit);
      }
    } catch (error) {
      console.error("Error cargando productos:", error);
      Alert.alert("Error", "No se pudo consultar la base de datos.");
      setProducts([]);
      setEmpty(false);
      setSearchText("");
      setHasMoreProducts(false);
      setProductsLimit(PAGE_SIZE);
      setRefreshKey((k) => k + 1);
      setTimeout(() => {
        loadProducts("", false, PAGE_SIZE);
      }, 0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!scannerVisible) {
      if (cameraMountTimerRef.current) {
        clearTimeout(cameraMountTimerRef.current);
        cameraMountTimerRef.current = null;
      }
      if (cameraWarningTimerRef.current) {
        clearTimeout(cameraWarningTimerRef.current);
        cameraWarningTimerRef.current = null;
      }
      setCameraMounted(false);
      setCameraSlow(false);
      return undefined;
    }

    setCameraMounted(true);
    console.log("[Camera] mounted", Date.now());
    if (cameraOpenRequestedAtRef.current) {
      console.log("[Camera] mount delay ms", Date.now() - cameraOpenRequestedAtRef.current);
    }

    cameraWarningTimerRef.current = setTimeout(() => {
      setCameraSlow(true);
    }, 5000);

    return () => {
      if (cameraMountTimerRef.current) {
        clearTimeout(cameraMountTimerRef.current);
        cameraMountTimerRef.current = null;
      }
      if (cameraWarningTimerRef.current) {
        clearTimeout(cameraWarningTimerRef.current);
        cameraWarningTimerRef.current = null;
      }
    };
  }, [scannerVisible]);

  const handleBarCodeScanned = useCallback(
    async ({ data }) => {
      if (scanningRef.current) return;

      const code = String(data ?? "").trim();
      if (!code) return;

      const now = Date.now();
      if (lastScanRef.current.code === code && now - lastScanRef.current.at < 1000) {
        return;
      }

      scanningRef.current = true;
      lastScanRef.current = { code, at: now };
      console.log("[Camera] barcode scanned", now, code);
      if (cameraOpenRequestedAtRef.current) {
        console.log("[Camera] read delay ms", now - cameraOpenRequestedAtRef.current);
      }

      try {
        setSearchText(code);
        setScannerVisible(false);
        const article = await scanSearchArticle(code);
        if (article) {
          const scannedProduct = {
            id: article.codigoInterno || article.codigoBarra || code,
            code: article.codigoInterno || article.codigoBarra || code,
            name: article.descripcion || "",
            price: article.precio ?? 0,
            codigoBarra: article.codigoBarra || "",
            codigoInterno: article.codigoInterno || "",
          };
          setEmpty(false);
          setProducts([scannedProduct]);
          setHasMoreProducts(false);
          setProductsLimit(1);
        } else {
          setEmpty(true);
          setProducts([]);
          setHasMoreProducts(false);
        }
      } finally {
        scanningRef.current = false;
      }
    },
    [],
  );

  const ensureCameraPermission = useCallback(async () => {
    if (permission?.granted) {
      console.log("[Camera] permission ready", Date.now());
      return true;
    }
    const result = await requestPermission();
    if (result?.granted) {
      console.log("[Camera] permission ready", Date.now());
      return true;
    }
    const message = result?.canAskAgain
      ? "Debes permitir el acceso a la camara para escanear."
      : "Permiso de camara denegado. Habilitalo desde los ajustes.";
    Alert.alert("Sin acceso", message);
    return false;
  }, [permission, requestPermission]);

  const handleOpenScanner = useCallback(async () => {
    console.log("[Camera] open requested", Date.now());
    if (await ensureCameraPermission()) {
      lastScanRef.current = { code: "", at: 0 };
      scanningRef.current = false;
      cameraOpenRequestedAtRef.current = Date.now();
      setCameraMounted(false);
      setCameraSlow(false);
      setScannerVisible(true);
    }
  }, [ensureCameraPermission]);

  const barcodeScannerSettings = useMemo(
    () => ({
      barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39"],
    }),
    [],
  );

  const onChangeSearchText = (text) => {
    setSearchText(text);
    if (text.length === 0) {
      loadProducts("", false, PAGE_SIZE);
      return;
    }
    loadProducts(text, true, PAGE_SIZE);
  };

  const handleLoadMoreProducts = () => {
    if (isLoading || !hasMoreProducts) return;
    loadProducts(searchText, searchText.length > 0, productsLimit + PAGE_SIZE);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: darkMode ? "#0F1720" : "#E7F1F9" }} key={refreshKey}>
      <RNModal visible={scannerVisible} animationType="slide">
        <View style={styles.scannerContainer}>
          {cameraMounted ? (
            <CameraView
              onBarcodeScanned={scannerVisible ? handleBarCodeScanned : undefined}
              barcodeScannerSettings={barcodeScannerSettings}
              facing="back"
              zoom={0}
              autofocus="on"
              style={StyleSheet.absoluteFillObject}
            />
          ) : (
            <View style={styles.cameraLoadingScreen}>
              <ActivityIndicator size="large" color="white" />
              <Text style={styles.cameraLoadingText}>Abriendo cámara...</Text>
              {cameraSlow ? (
                <Text style={styles.cameraLoadingHint}>La cámara está tardando más de lo normal...</Text>
              ) : null}
            </View>
          )}
          <View style={styles.overlay}>
            <Text style={styles.scanText}>Encuadre el codigo de barras</Text>
            <TouchableOpacity
              onPress={() => {
                scanningRef.current = false;
                setScannerVisible(false);
              }}
              style={styles.closeButton}
            >
              <Text style={{ color: "white", fontWeight: "bold" }}>CANCELAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </RNModal>

      <View
        style={[
          listProductsStyles.viewSearch,
          styles.searchRow,
          darkMode && styles.searchRowDark,
        ]}
      >
        <View style={[styles.searchIconWrap, darkMode && styles.searchIconWrapDark]}>
          <Image source={darkMode ? iconProductDark : iconProduct} style={styles.searchIconImage} />
        </View>
        <TextInput
          ref={refInput}
          autoFocus
          style={[
            listProductsStyles.textSearch,
            { flex: 1 },
            darkMode && styles.textSearchDark,
          ]}
          onChangeText={onChangeSearchText}
          value={searchText}
          placeholder="Buscar por codigo o descripcion"
          placeholderTextColor={darkMode ? "#9CB2C8" : "#7A7A7A"}
          onSubmitEditing={() => loadProducts(searchText, true)}
          returnKeyType="search"
        />

        <TouchableOpacity
          onPress={handleOpenScanner}
          style={styles.cameraIcon}
        >
          <Ionicons name="camera-outline" size={24} color={darkMode ? "#8FC3FF" : Colors.DBLUE} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={[listProductsStyles.loader]} size="large" color={darkMode ? "#8FC3FF" : "#00ff00"} />
      ) : empty ? (
        <View style={styles.emptyContainer}>
          <Text style={[listProductsStyles.emptyText, darkMode && { color: "#E8F0F8" }]}>No se encontraron resultados.</Text>
          <TouchableOpacity onPress={() => loadProducts("", false, PAGE_SIZE)}>
            <Text style={{ color: darkMode ? "#8FC3FF" : Colors.DBLUE, marginTop: 15 }}>Ver todos los productos</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          style={{ backgroundColor: darkMode ? "#0F1720" : "#E7F1F9" }}
          onEndReached={() => {
            handleLoadMoreProducts();
          }}
          onEndReachedThreshold={0.35}
          ListFooterComponent={hasMoreProducts ? (
            <View style={styles.loadMoreIndicator}>
              <ActivityIndicator size="small" color={darkMode ? "#8FC3FF" : Colors.DBLUE} />
              <Text style={styles.loadMoreHint(darkMode)}>Cargando mas articulos...</Text>
            </View>
          ) : <View />}
          ListFooterComponentStyle={{ height: hasMoreProducts ? 90 : 100 }}
          data={products}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <ProductItem
              name={item.name}
              price={item.price1}
              code={item.code}
              navigation={navigation}
              id={item.id}
              cancelaCarga={!loadImages}
              darkMode={darkMode}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 10,
    backgroundColor: "#fff",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
  },
  searchRowDark: {
    backgroundColor: "#152332",
    shadowOpacity: 0.22,
  },
  textSearchDark: {
    backgroundColor: "#152332",
    borderColor: "#2D4154",
    color: "#E8F0F8",
  },
  searchIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginLeft: 8,
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F5FA",
    borderWidth: 1,
    borderColor: Colors.BORDER,
  },
  searchIconWrapDark: {
    backgroundColor: "#243241",
    borderColor: "#2D4154",
  },
  searchIconImage: {
    width: 22,
    height: 22,
  },
  cameraIcon: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
  },
  cameraLoadingScreen: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#000",
  },
  cameraLoadingText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  cameraLoadingHint: {
    color: "#D8E4EE",
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  overlay: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  scanText: {
    color: "white",
    fontSize: 16,
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    overflow: "hidden",
  },
  closeButton: {
    backgroundColor: "#FF3B30",
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 30,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "transparent",
  },
  loadMoreIndicator: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  loadMoreHint: (darkMode) => ({
    color: darkMode ? "#8FC3FF" : Colors.DBLUE,
    fontWeight: "600",
    marginTop: 8,
  }),
});
