import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@styles/Colors";
import { Fonts, Radii, Shadow } from "@styles/Theme";
import Configuration from "@db/Configuration";
import { useThemeConfig } from "@context/ThemeContext";
import { DEFAULT_PRINT_FORMATS, getDefaultPrintDeviceConfig, loadPrintDeviceConfig, loadPrintFormats, normalizePrintDeviceConfig } from "@services/printLayoutService";
import { syncPrintFormatsFromSql } from "@services/printSqlService";
import { printArticle } from "@services/printerService";

const clone = (value, fallback = null) => {
  if (value === undefined || value === null) {
    return fallback;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return fallback;
  }
};

const formatDateTime = (value) => {
  if (!value) {
    return "Sin sincronizar";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Sin sincronizar";
  }

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

export default function PrintConfigurationScreen() {
  const navigation = useNavigation();
  const themeConfig = useThemeConfig() || {};
  const darkMode = Boolean(themeConfig.darkMode);
  const insets = useSafeAreaInsets() || { bottom: 0 };

  const [formats, setFormats] = useState(() =>
    clone(DEFAULT_PRINT_FORMATS, []) || [],
  );
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [status, setStatus] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState("");
  const [deviceConfig, setDeviceConfig] = useState(() =>
    getDefaultPrintDeviceConfig(),
  );

  const theme = useMemo(
    () => ({
      background: darkMode ? "#0F1720" : "#E8F2FC",
      surface: darkMode ? "#16212D" : Colors.SURFACE,
      surfaceAlt: darkMode ? "#1B2633" : "#F7FBFF",
      text: darkMode ? "#E8F0F8" : Colors.DGREY,
      muted: darkMode ? "#BFD0E0" : Colors.MUTED,
      border: darkMode ? "#243241" : Colors.BORDER,
      accent: "#1E88E5",
      accentDark: "#0B5FA5",
      success: "#1F8B4C",
    }),
    [darkMode],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await loadPrintFormats().catch(() => null);
      const nextFormats =
        Array.isArray(loaded) && loaded.length > 0
          ? loaded.filter(Boolean)
          : clone(DEFAULT_PRINT_FORMATS, []) || [];
      setFormats(nextFormats);
      setDeviceConfig(
        normalizePrintDeviceConfig(
          await loadPrintDeviceConfig().catch(() => getDefaultPrintDeviceConfig()),
        ),
      );
      const storedSync = await Configuration.getConfigValue("LAST_SYNC_AT").catch(
        () => "",
      );
      setLastSyncAt(String(storedSync || "").trim());
      setStatus("");
    } catch (error) {
      setFormats(clone(DEFAULT_PRINT_FORMATS, []) || []);
      setDeviceConfig(getDefaultPrintDeviceConfig());
      setStatus(error?.message || "No se pudo cargar la configuraciÃ³n.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const syncDesigns = useCallback(async () => {
    if (syncing) {
      return;
    }

    setSyncing(true);
    setStatus("");
    try {
      const sqlFormats = await syncPrintFormatsFromSql();
      if (Array.isArray(sqlFormats) && sqlFormats.length > 0) {
        setFormats(sqlFormats.filter(Boolean));
      } else {
        setFormats(clone(DEFAULT_PRINT_FORMATS, []) || []);
      }

      const now = new Date().toISOString();
      await Configuration.setConfigValue("LAST_SYNC_AT", now);
      setLastSyncAt(now);
      setStatus("DiseÃ±os sincronizados correctamente.");
    } catch (error) {
      setStatus(error?.message || "No se pudieron sincronizar los diseÃ±os desde SQL.");
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  const handlePrintTest = useCallback(async () => {
    if (printing) {
      return;
    }

    setPrinting(true);
    setStatus("");
    try {
      await printArticle({
        article: {
          descripcion: "Producto de prueba",
          codigoBarra: "4005900985712",
          codigoInterno: "12345",
          precio: 12500,
          stock: 25,
          companyName: "Nano Distribuciones",
        },
        formatKey: "product",
        format: DEFAULT_PRINT_FORMATS[0],
      });
      setStatus("Prueba enviada a la impresora.");
    } catch (error) {
      setStatus(error?.message || "No se pudo imprimir la prueba.");
    } finally {
      setPrinting(false);
    }
  }, [printing]);

  const handleOpenCalibration = useCallback(() => {
    navigation.navigate("PrintCalibrationScreen", {
      formatKey: "product",
      article: {
        descripcion: "Producto de prueba",
        codigoBarra: "4005900985712",
        codigoInterno: "12345",
        precio: 12500,
        stock: 25,
        companyName: "Nano Distribuciones",
      },
    });
  }, [navigation]);

  const formatCount = Array.isArray(formats) ? formats.length : 0;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 28 + insets.bottom },
        ]}
      >
        <View style={[styles.heroCard, { backgroundColor: theme.surface }, Shadow.sm]}>
          <Text style={[styles.title, { color: theme.text }]}>
            Configuración de impresión
          </Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>
            Calibrá la impresora de este dispositivo sin tocar SQL ni el editor.
          </Text>

          <View style={styles.heroActions}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: theme.accentDark },
              ]}
              onPress={syncDesigns}
              disabled={syncing || printing}
            >
              {syncing ? (
                <ActivityIndicator color={Colors.WHITE} />
              ) : (
                <Ionicons
                  name="cloud-download-outline"
                  size={18}
                  color={Colors.WHITE}
                />
              )}
              <Text style={styles.primaryButtonText}>Sincronizar diseños</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: theme.success },
              ]}
              onPress={handleOpenCalibration}
              disabled={printing || syncing}
            >
              <Ionicons
                name="color-filter-outline"
                size={18}
                color={Colors.WHITE}
              />
              <Text style={styles.primaryButtonText}>Calibración</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface }, Shadow.sm]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Estado</Text>
          <View
            style={[
              styles.infoRow,
              { borderColor: theme.border, backgroundColor: theme.surfaceAlt },
            ]}
          >
            <Text style={[styles.infoLabel, { color: theme.muted }]}>
              Diseños sincronizados
            </Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {formatCount}
            </Text>
          </View>
          <View
            style={[
              styles.infoRow,
              { borderColor: theme.border, backgroundColor: theme.surfaceAlt },
            ]}
          >
            <Text style={[styles.infoLabel, { color: theme.muted }]}>
              Última sincronización
            </Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {formatDateTime(lastSyncAt)}
            </Text>
          </View>
          <View
            style={[
              styles.infoRow,
              { borderColor: theme.border, backgroundColor: theme.surfaceAlt },
            ]}
          >
            <Text style={[styles.infoLabel, { color: theme.muted }]}>
              Estado local
            </Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {loading ? "Cargando..." : status || "Listo"}
            </Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface }, Shadow.sm]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Impresión de prueba
          </Text>
          <Text style={[styles.sectionHint, { color: theme.muted }]}>
            Usa el mismo flujo de impresión real, pero con una etiqueta de prueba.
          </Text>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.accent }]}
            onPress={handlePrintTest}
            disabled={printing || syncing}
          >
            {printing ? (
              <ActivityIndicator color={Colors.WHITE} />
            ) : (
              <Ionicons name="print-outline" size={18} color={Colors.WHITE} />
            )}
            <Text style={styles.primaryButtonText}>Imprimir prueba</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 14,
  },
  heroCard: {
    borderRadius: Radii.lg,
    padding: 16,
    gap: 12,
  },
  card: {
    borderRadius: Radii.lg,
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontFamily: Fonts.title,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Fonts.body,
    lineHeight: 20,
  },
  heroActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: Radii.md,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    flexGrow: 1,
  },
  primaryButtonText: {
    color: Colors.WHITE,
    fontSize: 14,
    fontFamily: Fonts.title,
    fontWeight: "700",
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: Fonts.title,
    fontWeight: "800",
  },
  sectionHint: {
    fontSize: 13,
    fontFamily: Fonts.body,
    lineHeight: 18,
  },
  infoRow: {
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: 12,
    gap: 4,
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: Fonts.body,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  infoValue: {
    fontSize: 14,
    fontFamily: Fonts.body,
    lineHeight: 20,
  },
});
