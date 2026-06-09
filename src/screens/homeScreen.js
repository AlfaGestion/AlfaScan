import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Image,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import BrandMark from "@components/BrandMark";
import ProductImage from "@components/ProductImage";
import Product from "@db/Product";
import Colors from "@styles/Colors";
import { Fonts, Radii, Shadow } from "@styles/Theme";
import Configuration from "@db/Configuration";
import { appendPrintHistory } from "@services/printHistory";
import { searchArticle, scanSearchArticle } from "@services/articleService";
import { getPrinterStatus, initPrinter, printSimpleProductLabel } from "@services/sunmiPrinterService";
import { useThemeConfig } from "@context/ThemeContext";

import alfaLogo from "../../assets/alfa_logo.png";

const MENU_ITEMS = [
  { key: "config", label: "Configuración", screen: "ConfigurationScreen", icon: "settings-outline" },
  { key: "sync", label: "Sincronización", screen: "SyncScreen", icon: "cloud-upload-outline" },
  { key: "products", label: "Productos", screen: "ProductsScreen", icon: "search-outline" },
  { key: "history", label: "Historial de impresiones", screen: "PrintHistoryScreen", icon: "receipt-outline" },
  { key: "about", label: "Acerca de / versión", screen: "AboutScreen", icon: "information-circle-outline" },
];

const PRINT_BUTTONS = [
  { key: "gondola", label: "Góndola" },
  { key: "product", label: "Producto" },
  { key: "small", label: "Chico" },
  { key: "custom", label: "Pers." },
];

const IMAGE_SIZE_MAP = {
  SMALL: { width: 72, height: 72 },
  MEDIUM: { width: 92, height: 92 },
  LARGE: { width: 114, height: 114 },
};

const loadConfigMap = (rows) =>
  (Array.isArray(rows) ? rows : []).reduce((acc, item) => {
    acc[String(item.key ?? "").trim()] = item.value;
    return acc;
  }, {});

const formatCurrency = (value) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? amount.toLocaleString("es-AR", {
        style: "currency",
        currency: "ARS",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : (0).toLocaleString("es-AR", {
        style: "currency",
        currency: "ARS",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
};

const formatDateTime = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

const formatRelativeSync = (value) => {
  if (!value) {
    return "Sin sincronizar";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Sin sincronizar";
  }

  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) {
    return "Sincronizado hace instantes";
  }
  if (diffMinutes < 60) {
    return `Sincronizado hace ${diffMinutes} min`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `Sincronizado hace ${diffHours} h`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `Sincronizado hace ${diffDays} d`;
};

export default function HomeScreen({ navigation }) {
  const [query, setQuery] = useState("");
  const [article, setArticle] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [cameraMounted, setCameraMounted] = useState(false);
  const [cameraSlow, setCameraSlow] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState("");
  const [printerStatus, setPrinterStatus] = useState(() => getPrinterStatus());
  const [screenConfig, setScreenConfig] = useState({
    connectionType: "LOCAL",
    sqlMode: "LOCAL",
    useStockColumn: false,
    useProductImage: false,
    productImageHomeSize: "MEDIUM",
  });
  const [permission, requestPermission] = useCameraPermissions();

  const lastScanRef = useRef({ code: "", at: 0 });
  const scanLockRef = useRef(false);
  const cameraMountTimerRef = useRef(null);
  const cameraWarningTimerRef = useRef(null);
  const cameraOpenRequestedAtRef = useRef(0);
  const { darkMode } = useThemeConfig();
  const insets = useSafeAreaInsets();

  const loadHomeConfig = useCallback(async () => {
    try {
      await Configuration.createTable();
      const rows = await Configuration.query();
      const map = loadConfigMap(rows);

      const connectionType = String(map.CONNECTION_TYPE ?? map.SQL_MODE ?? "LOCAL")
        .trim()
        .toUpperCase();
      const sqlMode = String(map.SQL_MODE ?? "LOCAL").trim().toUpperCase();
      const useStockColumn = Configuration.isTruthyConfigValue(
        map.SQL_USE_STOCK_COLUMN ?? map.SQL_USE_STOCK,
      );
      const useProductImage = Configuration.isTruthyConfigValue(
        map.USE_PRODUCT_IMAGE ?? map.CARGA_IMAGENES,
      );
      const productImageHomeSize = String(
        map.PRODUCT_IMAGE_HOME_SIZE ?? "MEDIUM",
      )
        .trim()
        .toUpperCase();

      setScreenConfig({
        connectionType,
        sqlMode,
        useStockColumn,
        useProductImage,
        productImageHomeSize,
      });
      setLastSyncAt(String(map.LAST_SYNC_AT ?? "").trim());
    } catch (e) {
      setLastSyncAt("");
      setScreenConfig((current) => ({
        ...current,
        connectionType: "LOCAL",
        sqlMode: "LOCAL",
        useStockColumn: false,
        useProductImage: false,
        productImageHomeSize: "MEDIUM",
      }));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHomeConfig();
    }, [loadHomeConfig]),
  );

  const refreshPrinterStatus = useCallback(async () => {
    const status = await initPrinter();
    setPrinterStatus(status || getPrinterStatus());
  }, []);

  useEffect(() => {
    refreshPrinterStatus();
  }, [refreshPrinterStatus]);

  useFocusEffect(
    useCallback(() => {
      refreshPrinterStatus();
    }, [refreshPrinterStatus]),
  );

  useEffect(() => {
    Product.ensureIndexes().catch(() => {});
  }, []);

  const themeStyles = useMemo(
    () => ({
      background: darkMode ? "#0F1720" : "#E8F2FC",
      surface: darkMode ? "#16212D" : Colors.SURFACE,
      surfaceAlt: darkMode ? "#1B2633" : "#F7FBFF",
      text: darkMode ? "#E8F0F8" : Colors.DGREY,
      muted: darkMode ? "#BFD0E0" : Colors.MUTED,
      border: darkMode ? "#243241" : Colors.BORDER,
      accent: "#1E88E5",
      accentDark: "#0B5FA5",
      inputBg: darkMode ? "#152332" : Colors.WHITE,
    }),
    [darkMode],
  );

  const showSyncInfo =
    screenConfig.connectionType === "API" || screenConfig.sqlMode === "LOCAL";

  const showStock = screenConfig.useStockColumn && article?.stock !== null && article?.stock !== undefined;
  const showProductImage = screenConfig.useProductImage && Boolean(article?.codigoInterno || article?.codigoBarra);
  const productImageSize = IMAGE_SIZE_MAP[screenConfig.productImageHomeSize] || IMAGE_SIZE_MAP.MEDIUM;
  const syncLabel = useMemo(() => formatRelativeSync(lastSyncAt), [lastSyncAt]);

  const executeSearch = useCallback(
    async (rawValue) => {
      const value = String(rawValue ?? "").trim();
      setQuery(value);
      setMessage("");
      setLoading(true);

      try {
        if (!value) {
          setArticle(null);
          setMessage("Ingresá o escaneá un código para buscar.");
          return;
        }

        const result = await searchArticle(value);
        if (!result) {
          setArticle(null);
          setMessage("No se encontró el artículo.");
          return;
        }

        setArticle(result);
      } catch (e) {
        setArticle(null);
        setMessage(e?.message || "No se pudo buscar el artículo.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const executeScanSearch = useCallback(async (rawValue) => {
    const value = String(rawValue ?? "").trim();
    setQuery(value);
    setMessage("");
    setLoading(true);

    try {
      if (!value) {
        setArticle(null);
        setMessage("Ingresá o escaneá un código para buscar.");
        return;
      }

      const result = await scanSearchArticle(value);
      if (!result) {
        setArticle(null);
        setMessage("No se encontró el artículo por código de barra.");
        return;
      }

      setArticle(result);
    } catch (e) {
      setArticle(null);
      setMessage(e?.message || "No se pudo buscar el artículo.");
    } finally {
      setLoading(false);
    }
  }, []);

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

    Alert.alert(
      "Sin permiso",
      result?.canAskAgain
        ? "Tenés que permitir el acceso a la cámara para escanear."
        : "El permiso de cámara fue denegado. Activarlo desde los ajustes del dispositivo.",
    );
    return false;
  }, [permission, requestPermission]);

  const handleScanPress = useCallback(async () => {
    Keyboard.dismiss();
    console.log("[Camera] open requested", Date.now());
    if (await ensureCameraPermission()) {
      lastScanRef.current = { code: "", at: 0 };
      scanLockRef.current = false;
      cameraOpenRequestedAtRef.current = Date.now();
      setCameraMounted(false);
      setCameraSlow(false);
      setScannerVisible(true);
    }
  }, [ensureCameraPermission]);

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

    cameraMountTimerRef.current = setTimeout(() => {
      InteractionManager.runAfterInteractions(() => {
        setCameraMounted(true);
        console.log("[Camera] mounted", Date.now());
        if (cameraOpenRequestedAtRef.current) {
          console.log("[Camera] mount delay ms", Date.now() - cameraOpenRequestedAtRef.current);
        }
      });
    }, 0);

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

  const handleBarcodeScanned = useCallback(
    async ({ data }) => {
      if (scanLockRef.current) {
        return;
      }

      const code = String(data ?? "").trim();
      if (!code) {
        return;
      }

      const now = Date.now();
      if (
        lastScanRef.current.code === code &&
        now - lastScanRef.current.at < 1000
      ) {
        return;
      }

      scanLockRef.current = true;
      lastScanRef.current = { code, at: now };
      console.log("[Camera] barcode scanned", now, code);
      if (cameraOpenRequestedAtRef.current) {
        console.log("[Camera] read delay ms", now - cameraOpenRequestedAtRef.current);
      }

      try {
        Vibration.vibrate(40);
      } catch (e) {
        // ignore vibration errors
      }

      setScannerVisible(false);
      await executeScanSearch(code);
    },
    [executeScanSearch],
  );

  const barcodeScannerSettings = useMemo(
    () => ({
      barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39"],
    }),
    [],
  );

  const handlePrint = useCallback(
    async (formatKey) => {
      if (!article) {
        setMessage("Buscá un artículo antes de imprimir.");
        return;
      }

      try {
        console.log("[PRINT] Home button pressed");
        console.log("[PRINT] formatKey", formatKey);
        await printSimpleProductLabel(formatKey, article);
        await appendPrintHistory({
          formatKey,
          formatLabel: PRINT_BUTTONS.find((item) => item.key === formatKey)?.label || formatKey,
          article,
        });
        await refreshPrinterStatus();
        setPrinterStatus(getPrinterStatus());
      } catch (e) {
        console.log("[PRINT] error", e?.message || e);
        Alert.alert("Impresora", e?.message || "No se pudo imprimir el artículo.");
      }
    },
    [article, refreshPrinterStatus],
  );

  const clearSearch = useCallback(() => {
    setQuery("");
    setArticle(null);
    setMessage("");
  }, []);

  const articleImageKey = article?.codigoInterno || article?.codigoBarra || "";
  const articleImageVisible = showProductImage && Boolean(articleImageKey);
  const printerStatusLabel =
    printerStatus.mode === "SIMULATION"
      ? "Impresora no detectada. Modo simulación activo."
      : printerStatus.available
        ? "Impresora lista"
        : printerStatus.message || "Impresora no detectada.";

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: themeStyles.background }]}>
      <Modal visible={scannerVisible} animationType="slide" onRequestClose={() => setScannerVisible(false)}>
        <View style={styles.scannerContainer}>
          {cameraMounted ? (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              autofocus="on"
              barcodeScannerSettings={barcodeScannerSettings}
              onBarcodeScanned={scannerVisible ? handleBarcodeScanned : undefined}
            />
          ) : (
            <View style={styles.cameraLoadingScreen}>
              <ActivityIndicator size="large" color={Colors.WHITE} />
              <Text style={styles.cameraLoadingText}>Abriendo cámara...</Text>
              {cameraSlow ? (
                <Text style={styles.cameraLoadingHint}>
                  La cámara está tardando más de lo normal...
                </Text>
              ) : null}
            </View>
          )}

          <View pointerEvents="box-none" style={styles.scannerOverlay}>
            <TouchableOpacity
              style={styles.scannerCloseFloating}
              onPress={() => setScannerVisible(false)}
            >
              <Ionicons name="close" size={18} color={Colors.WHITE} />
            </TouchableOpacity>

            <View style={styles.scannerGuideWrap}>
              <Text style={styles.scannerGuideTitle}>Apuntá al código de barras</Text>
              <Text style={styles.scannerGuideText}>Se cerrará solo al leerlo.</Text>
            </View>

            <View style={styles.scannerFrame}>
              <View style={styles.scannerCornerTopLeft} />
              <View style={styles.scannerCornerTopRight} />
              <View style={styles.scannerCornerBottomLeft} />
              <View style={styles.scannerCornerBottomRight} />
            </View>

            <View style={styles.scannerBottomSheet}>
              <Text style={styles.scannerBottomText}>
                Apuntá al código de barras y mantenelo dentro del marco.
              </Text>
              <TouchableOpacity style={styles.scannerCancelButton} onPress={() => setScannerVisible(false)}>
                <Text style={styles.scannerCancelText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <View style={styles.drawerBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setMenuVisible(false)} />
          <View style={[styles.drawer, { backgroundColor: themeStyles.surface }]}>
            <View style={styles.drawerHeader}>
              <BrandMark label="AlfaScan" size={56} darkMode={darkMode} />
            </View>
            {MENU_ITEMS.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.drawerItem, { borderBottomColor: themeStyles.border }]}
                onPress={() => {
                  setMenuVisible(false);
                  navigation.navigate(item.screen);
                }}
              >
                <Ionicons name={item.icon} size={20} color={themeStyles.accent} />
                <Text style={[styles.drawerItemText, { color: themeStyles.text }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 188 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.headerCard, { backgroundColor: themeStyles.surface }, Shadow.md]}>
          <TouchableOpacity style={[styles.headerIconButton, { backgroundColor: themeStyles.surfaceAlt }]} onPress={() => setMenuVisible(true)}>
            <Ionicons name="menu" size={24} color={themeStyles.text} />
          </TouchableOpacity>

          <View style={styles.headerBrand}>
            <Image source={alfaLogo} style={styles.headerLogo} resizeMode="contain" />
            <Text style={[styles.headerBrandText, { color: themeStyles.text }]} numberOfLines={1}>
              AlfaScan
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.headerIconButton, { backgroundColor: themeStyles.surfaceAlt }]}
            onPress={() => navigation.navigate("ConfigurationScreen")}
          >
            <Ionicons name="settings-outline" size={22} color={themeStyles.text} />
          </TouchableOpacity>
        </View>

        <View style={[styles.searchCard, { backgroundColor: themeStyles.surface }, Shadow.sm]}>
          <Text style={[styles.sectionLabel, { color: themeStyles.text }]}>Buscar artículo</Text>

          <View style={[styles.searchRow, { borderColor: themeStyles.border, backgroundColor: themeStyles.inputBg }]}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar o escanear..."
              placeholderTextColor={themeStyles.muted}
              style={[styles.searchInput, { color: themeStyles.text }]}
              returnKeyType="search"
              onSubmitEditing={() => executeSearch(query)}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {!!query ? (
              <TouchableOpacity style={styles.searchAction} onPress={clearSearch}>
                <Ionicons name="close-circle" size={20} color={themeStyles.muted} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.searchAction} onPress={() => executeSearch(query)}>
              <Ionicons name="search" size={22} color={themeStyles.accent} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.scanButton, { backgroundColor: themeStyles.accent }]}
            onPress={handleScanPress}
          >
            <Ionicons name="camera-outline" size={20} color={Colors.WHITE} />
            <Text style={styles.scanButtonText}>Escanear</Text>
          </TouchableOpacity>

          {showSyncInfo ? (
            <View style={[styles.syncInfo, { backgroundColor: themeStyles.surfaceAlt, borderColor: themeStyles.border }]}>
              <Ionicons name="time-outline" size={17} color={themeStyles.accent} />
              <Text style={[styles.syncInfoText, { color: themeStyles.text }]} numberOfLines={1}>
                {syncLabel}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.resultCard, { backgroundColor: themeStyles.surface }, Shadow.sm]}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.sectionLabel, { color: themeStyles.text }]}>Resultado</Text>
            {loading ? <ActivityIndicator size="small" color={themeStyles.accent} /> : null}
          </View>

          {article ? (
            <View>
              <View style={[styles.resultHero, articleImageVisible && styles.resultHeroWithImage]}>
                <View style={styles.resultMainColumn}>
                  <Text style={[styles.articleDescription, { color: themeStyles.text }]}>
                    {article.descripcion}
                  </Text>

                  <View style={styles.priceBox}>
                    <Text style={[styles.priceLabel, { color: themeStyles.muted }]}>Precio</Text>
                    <Text style={[styles.priceValue, { color: themeStyles.accentDark }]}>
                      {formatCurrency(article.precio)}
                    </Text>
                  </View>
                </View>

                {articleImageVisible ? (
                  <View
                    style={[
                      styles.imageCard,
                      {
                        backgroundColor: themeStyles.surfaceAlt,
                        borderColor: themeStyles.border,
                      },
                    ]}
                  >
                    <ProductImage
                      fileName={articleImageKey}
                      widthImage={productImageSize.width}
                      heightImage={productImageSize.height}
                      containerStyle={styles.imageInner}
                    />
                  </View>
                ) : null}
              </View>

              <View style={styles.detailBlock}>
                <View style={styles.articleRow}>
                  <Text style={[styles.articleLabel, { color: themeStyles.muted }]}>Código interno</Text>
                  <Text style={[styles.articleValue, { color: themeStyles.text }]}>
                    {article.codigoInterno || "-"}
                  </Text>
                </View>

                <View style={styles.articleRow}>
                  <Text style={[styles.articleLabel, { color: themeStyles.muted }]}>Código de barra</Text>
                  <Text style={[styles.articleValue, { color: themeStyles.text }]}>
                    {article.codigoBarra || "-"}
                  </Text>
                </View>

                {showStock ? (
                  <View style={styles.articleRow}>
                    <Text style={[styles.articleLabel, { color: themeStyles.muted }]}>Stock</Text>
                    <Text style={[styles.articleValue, { color: themeStyles.text }]}>
                      {article.stock}
                    </Text>
                  </View>
                ) : null}

                {article.fechaActualizacion ? (
                  <View style={styles.articleRow}>
                    <Text style={[styles.articleLabel, { color: themeStyles.muted }]}>Actualizado</Text>
                    <Text style={[styles.articleValue, { color: themeStyles.text }]}>
                      {formatDateTime(article.fechaActualizacion)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="barcode-outline" size={34} color={themeStyles.muted} />
              <Text style={[styles.emptyStateText, { color: themeStyles.muted }]}>
                Buscá o escaneá un artículo para ver su descripción, precio y stock.
              </Text>
            </View>
          )}

          {!!message ? <Text style={[styles.messageText, { color: themeStyles.accentDark }]}>{message}</Text> : null}
        </View>
      </ScrollView>

      <View
        style={[
          styles.printBar,
          {
            backgroundColor: themeStyles.surface,
            borderTopColor: themeStyles.border,
            paddingBottom: Math.max(insets.bottom, 12),
          },
          Shadow.md,
        ]}
      >
        <View style={styles.printStatusRow}>
          <Ionicons
            name={printerStatus.available ? "print-outline" : "information-circle-outline"}
            size={16}
            color={printerStatus.available ? themeStyles.accent : themeStyles.muted}
          />
          <Text
            style={[
              styles.printStatusText,
              { color: printerStatus.available ? themeStyles.text : themeStyles.muted },
            ]}
            numberOfLines={1}
          >
            {printerStatusLabel}
          </Text>
        </View>

        <View style={styles.printButtonsRow}>
        {PRINT_BUTTONS.map((button) => (
          <TouchableOpacity
            key={button.key}
            style={[
              styles.printButton,
              { backgroundColor: themeStyles.surface },
              Shadow.sm,
            ]}
            onPress={() => handlePrint(button.key)}
            disabled={!article}
          >
            <Ionicons
              name="print-outline"
              size={20}
              color={article ? themeStyles.accent : themeStyles.muted}
            />
            <Text
              style={[
                styles.printButtonText,
                { color: article ? themeStyles.text : themeStyles.muted },
              ]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {button.label}
            </Text>
          </TouchableOpacity>
        ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  headerCard: {
    borderRadius: Radii.xl,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  headerIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBrand: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  headerLogo: {
    width: 28,
    height: 28,
  },
  headerBrandText: {
    fontFamily: Fonts.display,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  searchCard: {
    borderRadius: Radii.xl,
    padding: 16,
    marginBottom: 14,
  },
  sectionLabel: {
    fontFamily: Fonts.display,
    fontSize: 17,
    marginBottom: 10,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    minHeight: 56,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    fontFamily: Fonts.body,
    paddingVertical: 10,
  },
  searchAction: {
    paddingLeft: 8,
    paddingVertical: 6,
  },
  scanButton: {
    marginTop: 12,
    borderRadius: 16,
    minHeight: 50,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  scanButtonText: {
    color: Colors.WHITE,
    fontFamily: Fonts.display,
    fontSize: 15,
  },
  syncInfo: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  syncInfoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.body,
  },
  resultCard: {
    borderRadius: Radii.xl,
    padding: 16,
    marginBottom: 14,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  resultHero: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  resultHeroWithImage: {
    alignItems: "flex-start",
  },
  resultMainColumn: {
    flex: 1,
    minWidth: 0,
  },
  articleDescription: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: Fonts.display,
    marginBottom: 12,
  },
  priceBox: {
    marginTop: 2,
    marginBottom: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "rgba(30,136,229,0.08)",
  },
  priceLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
    fontFamily: Fonts.display,
  },
  priceValue: {
    fontSize: 30,
    lineHeight: 34,
    fontFamily: Fonts.display,
  },
  imageCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 8,
    minWidth: 110,
    minHeight: 110,
    justifyContent: "center",
    alignItems: "center",
  },
  imageInner: {
    minWidth: 0,
    minHeight: 0,
  },
  detailBlock: {
    marginTop: 6,
  },
  articleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 16,
  },
  articleLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.body,
  },
  articleValue: {
    flex: 1.3,
    textAlign: "right",
    fontSize: 14,
    fontFamily: Fonts.body,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
  },
  emptyStateText: {
    marginTop: 10,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.body,
  },
  messageText: {
    marginTop: 10,
    fontSize: 13,
    fontFamily: Fonts.body,
  },
  printBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  printStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  printStatusText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Fonts.body,
  },
  printButtonsRow: {
    flexDirection: "row",
    gap: 8,
  },
  printButton: {
    flex: 1,
    minHeight: 70,
    borderRadius: Radii.lg,
    paddingHorizontal: 6,
    paddingVertical: 10,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  printButtonText: {
    textAlign: "center",
    fontSize: 11,
    lineHeight: 13,
    fontFamily: Fonts.display,
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  cameraLoadingScreen: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#000",
  },
  cameraLoadingText: {
    color: Colors.WHITE,
    fontSize: 16,
    fontFamily: Fonts.display,
  },
  cameraLoadingHint: {
    color: "#D8E4EE",
    fontSize: 13,
    fontFamily: Fonts.body,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    justifyContent: "space-between",
    alignItems: "center",
  },
  scannerCloseFloating: {
    alignSelf: "flex-end",
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,32,0.7)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  scannerGuideWrap: {
    alignSelf: "stretch",
    alignItems: "center",
    backgroundColor: "rgba(15,23,32,0.78)",
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  scannerGuideTitle: {
    color: Colors.WHITE,
    fontSize: 18,
    fontFamily: Fonts.display,
    textAlign: "center",
  },
  scannerGuideText: {
    marginTop: 4,
    color: "#D8E4EE",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    fontFamily: Fonts.body,
  },
  scannerFrame: {
    width: "84%",
    maxWidth: 320,
    aspectRatio: 1.45,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
    backgroundColor: "rgba(255,255,255,0.04)",
    marginVertical: 12,
  },
  scannerCornerTopLeft: {
    position: "absolute",
    top: -2,
    left: -2,
    width: 28,
    height: 28,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: Colors.WHITE,
    borderTopLeftRadius: 18,
  },
  scannerCornerTopRight: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 28,
    height: 28,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: Colors.WHITE,
    borderTopRightRadius: 18,
  },
  scannerCornerBottomLeft: {
    position: "absolute",
    bottom: -2,
    left: -2,
    width: 28,
    height: 28,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: Colors.WHITE,
    borderBottomLeftRadius: 18,
  },
  scannerCornerBottomRight: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: Colors.WHITE,
    borderBottomRightRadius: 18,
  },
  scannerBottomSheet: {
    alignSelf: "stretch",
    backgroundColor: "rgba(15,23,32,0.88)",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  scannerBottomText: {
    color: "#D8E4EE",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    fontFamily: Fonts.body,
  },
  scannerCancelButton: {
    marginTop: 12,
    alignSelf: "center",
    backgroundColor: "#D64545",
    paddingVertical: 12,
    paddingHorizontal: 26,
    borderRadius: 999,
  },
  scannerCancelText: {
    color: Colors.WHITE,
    fontFamily: Fonts.display,
    fontSize: 14,
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-start",
    alignItems: "flex-start",
  },
  drawer: {
    width: "78%",
    maxWidth: 320,
    minHeight: "100%",
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 24,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
  },
  drawerHeader: {
    marginBottom: 8,
  },
  drawerItem: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  drawerItemText: {
    fontSize: 15,
    fontFamily: Fonts.display,
  },
});
