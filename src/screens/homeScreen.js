import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BrandMark from "@components/BrandMark";
import Colors from "@styles/Colors";
import { Fonts, Radii, Shadow } from "@styles/Theme";
import Configuration from "@db/Configuration";
import { appendPrintHistory } from "@services/printHistory";
import { printArticle } from "@services/printerService";
import { searchArticle } from "@services/articleService";
import { useThemeConfig } from "@context/ThemeContext";

const MENU_ITEMS = [
  { key: "config", label: "Configuración", screen: "ConfigurationScreen", icon: "settings-outline" },
  { key: "sync", label: "Sincronización", screen: "SyncScreen", icon: "cloud-upload-outline" },
  { key: "products", label: "Productos", screen: "ProductsScreen", icon: "search-outline" },
  { key: "history", label: "Historial de impresiones", screen: "PrintHistoryScreen", icon: "receipt-outline" },
  { key: "about", label: "Acerca de / versión", screen: "AboutScreen", icon: "information-circle-outline" },
];

const PRINT_BUTTONS = [
  { key: "gondola", label: "Gónd." },
  { key: "product", label: "Prod." },
  { key: "small", label: "Chico" },
  { key: "custom", label: "Pers." },
];

const formatCurrency = (value) => {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) {
    return "$ 0.00";
  }
  return amount.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDateTime = (value) => {
  if (!value) {
    return "Sin sincronización";
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

export default function HomeScreen({ navigation }) {
  const [query, setQuery] = useState("");
  const [article, setArticle] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState("");
  const [permission, requestPermission] = useCameraPermissions();
  const scanningRef = useRef(false);
  const { darkMode } = useThemeConfig();
  const insets = useSafeAreaInsets();

  const loadSyncInfo = useCallback(async () => {
    try {
      await Configuration.createTable();
      const syncValue = await Configuration.getConfigValue("LAST_SYNC_AT");
      setLastSyncAt(String(syncValue ?? "").trim());
    } catch (e) {
      setLastSyncAt("");
    }
  }, []);

  useEffect(() => {
    loadSyncInfo();
  }, [loadSyncInfo]);

  useFocusEffect(
    useCallback(() => {
      loadSyncInfo();
    }, [loadSyncInfo])
  );

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
    [darkMode]
  );

  const executeSearch = useCallback(
    async (rawValue) => {
      const value = String(rawValue ?? "").trim();
      setQuery(value);
      setMessage("");
      setLoading(true);

      try {
        if (!value) {
          setArticle(null);
          setMessage("Ingresa o escanea un codigo para buscar.");
          return;
        }

        const result = await searchArticle(value);
        if (!result) {
          setArticle(null);
          setMessage("No se encontro el articulo.");
          return;
        }

        setArticle(result);
      } catch (e) {
        setArticle(null);
        setMessage(e?.message || "No se pudo buscar el articulo.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const ensureCameraPermission = useCallback(async () => {
    if (permission?.granted) {
      return true;
    }

    const result = await requestPermission();
    if (result?.granted) {
      return true;
    }

    Alert.alert(
      "Sin permiso",
      result?.canAskAgain
        ? "Debes permitir el acceso a la camara para escanear."
        : "El permiso de camara fue denegado. Activarlo desde los ajustes del dispositivo."
    );
    return false;
  }, [permission, requestPermission]);

  const handleScanPress = useCallback(async () => {
    Keyboard.dismiss();
    if (await ensureCameraPermission()) {
      setScannerVisible(true);
    }
  }, [ensureCameraPermission]);

  const handleBarcodeScanned = useCallback(
    async ({ data }) => {
      if (scanningRef.current) {
        return;
      }

      scanningRef.current = true;
      try {
        setScannerVisible(false);
        setQuery(String(data ?? ""));
        await executeSearch(data);
      } finally {
        scanningRef.current = false;
      }
    },
    [executeSearch]
  );

  const handlePrint = useCallback(
    async (formatKey) => {
      if (!article) {
        setMessage("Busque un artículo antes de imprimir.");
        return;
      }

      try {
        const format = PRINT_BUTTONS.find((item) => item.key === formatKey)?.label || formatKey;
        await printArticle({ article, formatKey });
        await appendPrintHistory({
          formatKey,
          formatLabel: format,
          article,
        });
      } catch (e) {
        setMessage(e?.message || "No se pudo imprimir el artículo.");
      }
    },
    [article]
  );

  const clearSearch = useCallback(() => {
    setQuery("");
    setArticle(null);
    setMessage("");
  }, []);

  const lastSyncLabel = useMemo(() => formatDateTime(lastSyncAt), [lastSyncAt]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: themeStyles.background }]}>
      <Modal visible={scannerVisible} animationType="slide" onRequestClose={() => setScannerVisible(false)}>
        <View style={styles.scannerContainer}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            onBarcodeScanned={scannerVisible ? handleBarcodeScanned : undefined}
            barcodeScannerSettings={{
              barcodeTypes: ["ean13", "ean8", "code128", "code39", "code93", "upc_a", "upc_e", "qr"],
            }}
          />
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerCard}>
              <Text style={styles.scannerTitle}>Encuadre el codigo de barras</Text>
              <Text style={styles.scannerSubtitle}>El lector registrara el primer codigo valido detectado.</Text>
              <TouchableOpacity style={styles.scannerCloseButton} onPress={() => setScannerVisible(false)}>
                <Text style={styles.scannerCloseText}>Cancelar</Text>
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

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.headerCard, { backgroundColor: themeStyles.surface }, Shadow.md]}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity style={styles.menuButton} onPress={() => setMenuVisible(true)}>
              <Ionicons name="menu" size={26} color={themeStyles.text} />
            </TouchableOpacity>

            <View style={styles.brandWrap}>
              <BrandMark label="AlfaScan" size={72} darkMode={darkMode} />
            </View>

            <TouchableOpacity style={styles.menuButton} onPress={() => navigation.navigate("ConfigurationScreen")}>
              <Ionicons name="settings-outline" size={24} color={themeStyles.text} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.subtitle, { color: themeStyles.muted }]}>
            Búsqueda por código, escaneo rápido e impresión directa.
          </Text>
        </View>

        <View style={[styles.searchCard, { backgroundColor: themeStyles.surface }, Shadow.sm]}>
          <Text style={[styles.sectionLabel, { color: themeStyles.text }]}>Código de barras o artículo</Text>
          <View style={[styles.searchRow, { borderColor: themeStyles.border, backgroundColor: themeStyles.inputBg }]}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Ingresar o escanear código"
              placeholderTextColor={themeStyles.muted}
              style={[styles.searchInput, { color: themeStyles.text }]}
              returnKeyType="search"
              onSubmitEditing={() => executeSearch(query)}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {!!query && (
              <TouchableOpacity style={styles.searchAction} onPress={clearSearch}>
                <Ionicons name="close-circle" size={20} color={themeStyles.muted} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.searchAction} onPress={() => executeSearch(query)}>
              <Ionicons name="search" size={22} color={themeStyles.accent} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.scanButton, { backgroundColor: themeStyles.accent }]}
            onPress={handleScanPress}
          >
            <Ionicons name="barcode-outline" size={20} color={Colors.WHITE} />
            <Text style={styles.scanButtonText}>Abrir cámara / lector</Text>
          </TouchableOpacity>

          <View style={[styles.syncInfo, { backgroundColor: themeStyles.surfaceAlt, borderColor: themeStyles.border }]}>
            <Ionicons name="time-outline" size={18} color={themeStyles.accent} />
            <Text style={[styles.syncInfoText, { color: themeStyles.text }]}>
              Última sincronización: {lastSyncLabel}
            </Text>
          </View>
        </View>

        <View style={[styles.resultCard, { backgroundColor: themeStyles.surface }, Shadow.sm]}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.sectionLabel, { color: themeStyles.text }]}>Resultado</Text>
            {loading ? <ActivityIndicator size="small" color={themeStyles.accent} /> : null}
          </View>

          {article ? (
            <View>
              <Text style={[styles.articleDescription, { color: themeStyles.text }]}>{article.descripcion}</Text>

              <View style={styles.articleRow}>
                <Text style={[styles.articleLabel, { color: themeStyles.muted }]}>Código interno</Text>
                <Text style={[styles.articleValue, { color: themeStyles.text }]}>{article.codigoInterno || "-"}</Text>
              </View>

              <View style={styles.articleRow}>
                <Text style={[styles.articleLabel, { color: themeStyles.muted }]}>Código de barra</Text>
                <Text style={[styles.articleValue, { color: themeStyles.text }]}>{article.codigoBarra || "-"}</Text>
              </View>

              <View style={styles.priceBox}>
                <Text style={[styles.priceLabel, { color: themeStyles.muted }]}>Precio</Text>
                <Text style={[styles.priceValue, { color: themeStyles.accentDark }]}>{formatCurrency(article.precio)}</Text>
              </View>

              {article.stock !== null && article.stock !== undefined ? (
                <View style={styles.articleRow}>
                  <Text style={[styles.articleLabel, { color: themeStyles.muted }]}>Stock</Text>
                  <Text style={[styles.articleValue, { color: themeStyles.text }]}>{article.stock}</Text>
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
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="barcode-outline" size={34} color={themeStyles.muted} />
              <Text style={[styles.emptyStateText, { color: themeStyles.muted }]}>
                Busque o escanee un articulo para ver su descripcion, precio y stock.
              </Text>
            </View>
          )}

          {!!message ? <Text style={[styles.messageText, { color: themeStyles.accentDark }]}>{message}</Text> : null}
        </View>

        <View style={styles.footerInfo}>
          <Text style={[styles.footerText, { color: themeStyles.muted }]}>
            AlfaScan listo para dispositivos Sunmi y uso en mostrador.
          </Text>
        </View>
      </ScrollView>

      <View
        style={[
          styles.printBar,
          {
            backgroundColor: themeStyles.surface,
            borderTopColor: themeStyles.border,
            paddingBottom: Math.max(insets.bottom, 10),
          },
          Shadow.md,
        ]}
      >
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
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              {button.label}
            </Text>
          </TouchableOpacity>
        ))}
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
    paddingBottom: 116,
  },
  headerCard: {
    borderRadius: Radii.xl,
    padding: 16,
    marginBottom: 14,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  brandWrap: {
    flex: 1,
    alignItems: "center",
  },
  subtitle: {
    marginTop: 8,
    textAlign: "center",
    fontFamily: Fonts.body,
    fontSize: 13,
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
    minHeight: 52,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
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
    minHeight: 48,
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
    paddingVertical: 10,
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
    marginBottom: 6,
  },
  articleDescription: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: Fonts.display,
    marginBottom: 12,
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
  priceBox: {
    marginTop: 4,
    marginBottom: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
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
    fontSize: 28,
    fontFamily: Fonts.display,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
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
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
  },
  printGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  printButton: {
    flex: 1,
    minHeight: 58,
    borderRadius: Radii.lg,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  printButtonText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 13,
    fontFamily: Fonts.display,
  },
  footerInfo: {
    marginTop: 16,
    alignItems: "center",
  },
  footerText: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Fonts.body,
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    padding: 18,
  },
  scannerCard: {
    backgroundColor: "rgba(15,23,32,0.88)",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  scannerTitle: {
    color: Colors.WHITE,
    fontSize: 18,
    fontFamily: Fonts.display,
    textAlign: "center",
  },
  scannerSubtitle: {
    marginTop: 8,
    color: "#D8E4EE",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    fontFamily: Fonts.body,
  },
  scannerCloseButton: {
    marginTop: 14,
    alignSelf: "center",
    backgroundColor: "#D64545",
    paddingVertical: 12,
    paddingHorizontal: 26,
    borderRadius: 999,
  },
  scannerCloseText: {
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
