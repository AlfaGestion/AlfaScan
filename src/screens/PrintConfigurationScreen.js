import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Alert, ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ConfigItem from "@components/ConfigItem";
import PrintPreview from "@components/print/PrintPreview";
import PrintPropertiesPanel from "@components/print/PrintPropertiesPanel";
import Configuration from "@db/Configuration";
import Colors from "@styles/Colors";
import { Fonts, Radii, Shadow } from "@styles/Theme";
import { useThemeConfig } from "@context/ThemeContext";
import {
  createSampleProduct,
  DEFAULT_PRINT_FORMATS,
  PRINT_FORMAT_KEYS,
  getDefaultPrintFormat,
  normalizePrintConfig,
  renderPrintLayout,
  savePrintFormats,
} from "@services/printLayoutService";
import { printArticle } from "@services/printerService";

const GENERAL_ALIGNMENT_OPTIONS = [
  { label: "Izquierda", value: "left" },
  { label: "Centro", value: "center" },
  { label: "Derecha", value: "right" },
];

const createVisibilityMap = () => ({
  showDescription: "description",
  showPrice: "price",
  showBarcode: "barcode",
  showStock: "stock",
  showDate: "date",
  showCompanyName: "companyName",
  showInternalCode: "internalCode",
  showLogo: "logo",
});

const clone = (value) => JSON.parse(JSON.stringify(value));

const safeNormalizePrintConfig = (value) => {
  if (typeof normalizePrintConfig === "function") {
    try {
      return normalizePrintConfig(value);
    } catch (error) {
      if (__DEV__) {
        console.log("[PrintConfig] normalize fallback", error?.message || error);
      }
    }
  }

  return {
    gondola: getDefaultPrintFormat("gondola"),
    product: getDefaultPrintFormat("product"),
    small: getDefaultPrintFormat("small"),
    custom: getDefaultPrintFormat("custom"),
  };
};

class PrintSectionErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error) {
    if (__DEV__) {
      console.log("[PrintConfig] section error", error?.message || error);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <View style={[styles.sectionErrorBox, { backgroundColor: this.props.theme.surfaceAlt, borderColor: this.props.theme.border }]}>
            <Text style={[styles.sectionErrorTitle, { color: this.props.theme.text }]}>
              No se pudo cargar esta sección
            </Text>
            <Text style={[styles.sectionErrorText, { color: this.props.theme.muted }]}>
              Usando configuración básica.
            </Text>
          </View>
        )
      );
    }

    return this.props.children;
  }
}

const syncElementVisibility = (format, flagKey, visible) => {
  const visibilityMap = createVisibilityMap(format);
  const targetKey = visibilityMap[flagKey];
  const next = { ...format, [flagKey]: Boolean(visible) };
  if (!targetKey || !Array.isArray(format.elements)) {
    return next;
  }

  next.elements = format.elements.map((element) =>
    element.key === targetKey ? { ...element, visible: Boolean(visible) } : element,
  );
  return next;
};

const normalizeElementValue = (field, value) => {
  if (["visible", "uppercase", "showSymbol", "thousandSeparator", "showNumber"].includes(field)) {
    return Boolean(value);
  }
  if (["fontSize", "x", "y", "width", "height", "decimals", "maxLines", "zIndex"].includes(field)) {
    const parsed = parseInt(String(value ?? "").trim(), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return String(value ?? "").trim();
};

const getSelectedElement = (format, selectedKey) =>
  (format?.elements || []).find((element) => element.key === selectedKey) || null;

const DEFAULT_SELECTED_ELEMENT_KEY = "description";

const pickFormatList = (formats) =>
  PRINT_FORMAT_KEYS.map((key, index) => formats?.[key] || DEFAULT_PRINT_FORMATS[index]);

const FormatTabs = ({ formats, activeIndex, onChange, theme }) => (
  <View style={styles.tabsRow}>
    {(Array.isArray(formats) ? formats : []).map((item, index) => {
      const active = activeIndex === index;
      return (
        <TouchableOpacity
          key={item.key}
          onPress={() => onChange(index)}
          style={[
            styles.tabChip,
            {
              backgroundColor: active ? theme.accent : theme.surfaceAlt,
              borderColor: active ? theme.accent : theme.border,
            },
          ]}
        >
          <Text style={[styles.tabText, { color: active ? Colors.WHITE : theme.text }]}>{item.name}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const SectionTitle = ({ children, theme }) => (
  <Text style={[styles.sectionTitle, { color: theme.text }]}>{children}</Text>
);

export default function PrintConfigurationScreen() {
  const [formats, setFormats] = useState(() => safeNormalizePrintConfig(DEFAULT_PRINT_FORMATS));
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedElementKey, setSelectedElementKey] = useState(DEFAULT_SELECTED_ELEMENT_KEY);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState("");
  const [previewLayout, setPreviewLayout] = useState(null);
  const [loading, setLoading] = useState(true);
  const { darkMode } = useThemeConfig();
  const insets = useSafeAreaInsets();

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
    }),
    [darkMode],
  );

  const safeFormats = safeNormalizePrintConfig(formats);
  const formatList = pickFormatList(safeFormats);
  const activeFormat = formatList[activeIndex] || formatList[0] || DEFAULT_PRINT_FORMATS[0];
  const selectedElement = getSelectedElement(activeFormat, selectedElementKey);
  const previewProduct = useMemo(() => createSampleProduct(), []);

  const refreshPreviewLayout = useCallback(() => {
    setPreviewLayout(renderPrintLayout(activeFormat, previewProduct));
  }, [activeFormat, previewProduct]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await Configuration.createTable();
      const raw = await Configuration.getConfigValue("PRINT_FORMATS_JSON");
      const normalized = safeNormalizePrintConfig(raw);
      console.log("print config normalized", normalized);
      setFormats(normalized);
      if (!raw || String(raw).trim() !== JSON.stringify(normalized)) {
        await savePrintFormats(normalized);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    refreshPreviewLayout();
  }, [refreshPreviewLayout]);

  useEffect(() => {
    if (!selectedElement) {
      const firstVisible =
        activeFormat?.elements?.find((element) => element?.visible) || activeFormat?.elements?.[0];
      setSelectedElementKey(firstVisible?.key || DEFAULT_SELECTED_ELEMENT_KEY);
    }
  }, [activeFormat, selectedElement]);

  useLayoutEffect(() => {
    refreshPreviewLayout();
  }, [refreshPreviewLayout]);

  const updateActiveFormat = useCallback(
    (updater) => {
      setFormats((current) => {
        const normalized = safeNormalizePrintConfig(current);
        const next = { ...normalized };
        const key = PRINT_FORMAT_KEYS[activeIndex] || PRINT_FORMAT_KEYS[0];
        next[key] = updater(normalized[key] || DEFAULT_PRINT_FORMATS[activeIndex] || DEFAULT_PRINT_FORMATS[0]);
        return next;
      });
    },
    [activeIndex],
  );

  const updateFormatField = useCallback(
    (field, value) => {
      updateActiveFormat((current) => ({ ...current, [field]: value }));
    },
    [updateActiveFormat],
  );

  const updateElementField = useCallback(
    (field, value) => {
      updateActiveFormat((current) => ({
        ...current,
        elements: (current.elements || []).map((element) =>
          element.key === selectedElementKey
            ? { ...element, [field]: normalizeElementValue(field, value) }
            : element,
        ),
      }));
    },
    [selectedElementKey, updateActiveFormat],
  );

  const moveElement = useCallback(
    (key, nextX, nextY) => {
      updateActiveFormat((current) => ({
        ...current,
        elements: (current.elements || []).map((element) =>
          element.key === key ? { ...element, x: Math.max(0, Math.round(nextX)), y: Math.max(0, Math.round(nextY)) } : element,
        ),
      }));
    },
    [updateActiveFormat],
  );

  const handleQuickAction = useCallback(
    (action) => {
      if (!selectedElement) {
        return;
      }

      const layout = renderPrintLayout(activeFormat, previewProduct);
      const baseHeight = layout.scale > 0 ? layout.paperHeightPx / layout.scale : 320;
      const baseWidth = 320;

      const apply = (patch) => {
        updateElementField("x", patch.x ?? selectedElement.x);
        updateElementField("y", patch.y ?? selectedElement.y);
        if (patch.fontSize !== undefined) {
          updateElementField("fontSize", patch.fontSize);
        }
        if (patch.zIndex !== undefined) {
          updateElementField("zIndex", patch.zIndex);
        }
      };

      switch (action) {
        case "fontUp":
          updateElementField("fontSize", Number(selectedElement.fontSize || 16) + 2);
          break;
        case "fontDown":
          updateElementField("fontSize", Math.max(8, Number(selectedElement.fontSize || 16) - 2));
          break;
        case "moveUp":
          apply({ y: Math.max(0, Number(selectedElement.y || 0) - 4) });
          break;
        case "moveDown":
          apply({ y: Math.max(0, Number(selectedElement.y || 0) + 4) });
          break;
        case "moveLeft":
          apply({ x: Math.max(0, Number(selectedElement.x || 0) - 4) });
          break;
        case "moveRight":
          apply({ x: Math.max(0, Number(selectedElement.x || 0) + 4) });
          break;
        case "centerX":
          apply({ x: Math.max(0, Math.round((baseWidth - Number(selectedElement.width || 0)) / 2)) });
          break;
        case "centerY":
          apply({ y: Math.max(0, Math.round((baseHeight - Number(selectedElement.height || 0)) / 2)) });
          break;
        case "bringFront": {
          const maxZ = Math.max(...(activeFormat.elements || []).map((element) => Number(element.zIndex || 1)));
          updateElementField("zIndex", maxZ + 1);
          break;
        }
        case "sendBack": {
          const minZ = Math.min(...(activeFormat.elements || []).map((element) => Number(element.zIndex || 1)));
          updateElementField("zIndex", Math.max(1, minZ - 1));
          break;
        }
        default:
          break;
      }
    },
    [activeFormat, previewProduct, selectedElement, updateElementField],
  );

  const save = async () => {
    setSaving(true);
    setStatus("");
    try {
      await savePrintFormats(safeFormats);
      setStatus("Diseño de impresión guardado correctamente.");
    } catch (e) {
      setStatus(e?.message || "No se pudo guardar el diseño.");
    } finally {
      setSaving(false);
    }
  };

  const restoreDesign = () => {
    Alert.alert(
      "Restaurar diseño",
      "Esto volverá el formato actual al diseño inicial. ¿Querés continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Restaurar",
          style: "destructive",
          onPress: () => {
            const fresh = getDefaultPrintFormat(activeFormat.key);
            setFormats((current) => {
              const normalized = safeNormalizePrintConfig(current);
              return {
                ...normalized,
                [fresh.key]: fresh,
              };
            });
            setSelectedElementKey(
              fresh.elements?.find((item) => item.visible)?.key ||
                fresh.elements?.[0]?.key ||
                DEFAULT_SELECTED_ELEMENT_KEY,
            );
            setStatus("Diseño restaurado.");
          },
        },
      ],
    );
  };

  const printTest = async () => {
    if (testing) {
      return;
    }

    setTesting(true);
    setStatus("");
    try {
      await printArticle({ article: previewProduct, formatKey: activeFormat.key, format: activeFormat });
      setStatus("Prueba de impresión enviada.");
    } catch (e) {
      setStatus(e?.message || "No se pudo imprimir la prueba.");
    } finally {
      setTesting(false);
    }
  };

  const toggleFlag = useCallback(
    (field, value) => {
      updateActiveFormat((current) => syncElementVisibility(current, field, value));
    },
    [updateActiveFormat],
  );

  const previewPaperInfo = previewLayout
    ? `${activeFormat.paperWidth === "custom" ? "Personalizado" : `${activeFormat.paperWidth} mm`} • alto estimado ${Math.round(
        previewLayout.paperHeightPx,
      )} px`
    : "";

  const formatActionsDisabled = saving || testing || loading;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 28 + insets.bottom }]}>
        <View style={[styles.headerCard, { backgroundColor: theme.surface }, Shadow.md]}>
          <Text style={[styles.title, { color: theme.text }]}>Configurar impresión</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>
            Diseñá la etiqueta, tocá un elemento para moverlo y guardá el layout completo por formato.
          </Text>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.accent }]}
              onPress={printTest}
              disabled={formatActionsDisabled}
            >
              {testing ? <ActivityIndicator color={Colors.WHITE} /> : <Ionicons name="print-outline" size={18} color={Colors.WHITE} />}
              <Text style={styles.actionButtonText}>Imprimir prueba</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.accentDark }]}
              onPress={save}
              disabled={formatActionsDisabled}
            >
              {saving ? <ActivityIndicator color={Colors.WHITE} /> : <Ionicons name="save-outline" size={18} color={Colors.WHITE} />}
              <Text style={styles.actionButtonText}>Guardar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: "#D64545" }]}
              onPress={restoreDesign}
              disabled={formatActionsDisabled}
            >
              <Ionicons name="refresh-outline" size={18} color={Colors.WHITE} />
              <Text style={styles.actionButtonText}>Restaurar diseño</Text>
            </TouchableOpacity>
          </View>

          <FormatTabs formats={formatList} activeIndex={activeIndex} onChange={setActiveIndex} theme={theme} />
          <Text style={[styles.paperInfo, { color: theme.muted }]}>{previewPaperInfo}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface }, Shadow.sm]}>
          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={theme.accent} />
              <Text style={[styles.loadingText, { color: theme.muted }]}>Cargando formatos...</Text>
            </View>
          ) : (
            <PrintSectionErrorBoundary
              theme={theme}
              fallback={
                <View style={[styles.sectionErrorBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                  <Text style={[styles.sectionErrorTitle, { color: theme.text }]}>No se pudo cargar la vista previa</Text>
                  <Text style={[styles.sectionErrorText, { color: theme.muted }]}>
                    Usando configuración básica.
                  </Text>
                </View>
              }
            >
              <PrintPreview
                title="Vista previa editable"
                format={activeFormat}
                product={previewProduct}
                selectedElementKey={selectedElementKey}
                onSelectElement={setSelectedElementKey}
                onMoveElement={moveElement}
                editable
                theme={theme}
              />
            </PrintSectionErrorBoundary>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface }, Shadow.sm]}>
          <SectionTitle theme={theme}>Editor de elementos</SectionTitle>
          <PrintSectionErrorBoundary
            theme={theme}
            fallback={
              <View style={[styles.sectionErrorBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                <Text style={[styles.sectionErrorTitle, { color: theme.text }]}>No se pudo cargar el editor</Text>
                <Text style={[styles.sectionErrorText, { color: theme.muted }]}>
                  Se mantiene la configuración guardada.
                </Text>
              </View>
            }
          >
            <PrintPropertiesPanel
              element={selectedElement}
              onChange={updateElementField}
              onQuickAction={handleQuickAction}
              onToggleVisible={(value) => updateElementField("visible", value)}
              theme={theme}
              darkMode={darkMode}
            />
          </PrintSectionErrorBoundary>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface }, Shadow.sm]}>
          <SectionTitle theme={theme}>Configuración tradicional</SectionTitle>
          <ConfigItem
            type="input"
            title="Nombre del formato"
            field="name"
            placeholder="Góndola"
            value={activeFormat.name}
            handleChange={updateFormatField}
            darkMode={darkMode}
          />
          <ConfigItem
            type="select"
            title="Ancho papel"
            field="paperWidth"
            value={activeFormat.paperWidth}
            options={[
              { label: "58 mm", value: "58" },
              { label: "80 mm", value: "80" },
              { label: "Personalizado", value: "custom" },
            ]}
            handleChange={updateFormatField}
            darkMode={darkMode}
          />
          {String(activeFormat.paperWidth) === "custom" ? (
            <>
              <ConfigItem
                type="input"
                title="Ancho personalizado"
                field="customPaperWidth"
                placeholder="320"
                value={activeFormat.customPaperWidth || ""}
                keyboardType="numeric"
                handleChange={updateFormatField}
                darkMode={darkMode}
              />
              <ConfigItem
                type="input"
                title="Alto personalizado"
                field="customPaperHeight"
                placeholder="360"
                value={activeFormat.customPaperHeight || ""}
                keyboardType="numeric"
                handleChange={updateFormatField}
                darkMode={darkMode}
              />
            </>
          ) : null}
          <ConfigItem
            type="input"
            title="Cantidad de copias"
            field="copies"
            placeholder="1"
            value={activeFormat.copies}
            keyboardType="numeric"
            handleChange={updateFormatField}
            darkMode={darkMode}
          />
          <ConfigItem
            type="input"
            title="Margen superior"
            field="marginTop"
            placeholder="0"
            value={activeFormat.marginTop}
            keyboardType="numeric"
            handleChange={updateFormatField}
            darkMode={darkMode}
          />
          <ConfigItem
            type="input"
            title="Margen inferior"
            field="marginBottom"
            placeholder="0"
            value={activeFormat.marginBottom}
            keyboardType="numeric"
            handleChange={updateFormatField}
            darkMode={darkMode}
          />
          <ConfigItem
            type="select"
            title="Alineación general"
            field="alignment"
            value={activeFormat.alignment}
            options={GENERAL_ALIGNMENT_OPTIONS}
            handleChange={updateFormatField}
            darkMode={darkMode}
          />
          <ConfigItem
            type="checkbox"
            title="Mostrar descripción"
            field="showDescription"
            value={activeFormat.showDescription}
            handleChange={(field, value) => toggleFlag(field, value)}
            darkMode={darkMode}
          />
          <ConfigItem
            type="checkbox"
            title="Mostrar precio"
            field="showPrice"
            value={activeFormat.showPrice}
            handleChange={(field, value) => toggleFlag(field, value)}
            darkMode={darkMode}
          />
          <ConfigItem
            type="checkbox"
            title="Mostrar código de barra"
            field="showBarcode"
            value={activeFormat.showBarcode}
            handleChange={(field, value) => toggleFlag(field, value)}
            darkMode={darkMode}
          />
          <ConfigItem
            type="checkbox"
            title="Mostrar código interno"
            field="showInternalCode"
            value={activeFormat.showInternalCode}
            handleChange={(field, value) => toggleFlag(field, value)}
            darkMode={darkMode}
          />
          <ConfigItem
            type="checkbox"
            title="Mostrar stock"
            field="showStock"
            value={activeFormat.showStock}
            handleChange={(field, value) => toggleFlag(field, value)}
            darkMode={darkMode}
          />
          <ConfigItem
            type="checkbox"
            title="Mostrar fecha"
            field="showDate"
            value={activeFormat.showDate}
            handleChange={(field, value) => toggleFlag(field, value)}
            darkMode={darkMode}
          />
          <ConfigItem
            type="checkbox"
            title="Mostrar empresa"
            field="showCompanyName"
            value={activeFormat.showCompanyName}
            handleChange={(field, value) => toggleFlag(field, value)}
            darkMode={darkMode}
          />
          <ConfigItem
            type="checkbox"
            title="Mostrar logo"
            field="showLogo"
            value={activeFormat.showLogo}
            handleChange={(field, value) => toggleFlag(field, value)}
            darkMode={darkMode}
          />
          <ConfigItem
            type="checkbox"
            title="Vista previa antes de imprimir"
            field="previewBeforePrint"
            value={activeFormat.previewBeforePrint}
            handleChange={updateFormatField}
            darkMode={darkMode}
          />
        </View>

        {!!status ? (
          <View style={[styles.statusCard, { backgroundColor: theme.surface }, Shadow.sm]}>
            <Text style={[styles.statusText, { color: theme.text }]}>{status}</Text>
          </View>
        ) : null}
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
    paddingBottom: 28,
  },
  headerCard: {
    borderRadius: Radii.xl,
    padding: 18,
    marginBottom: 14,
  },
  title: {
    fontSize: 24,
    fontFamily: Fonts.display,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.body,
    marginBottom: 14,
  },
  headerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  actionButton: {
    minHeight: 42,
    borderRadius: 16,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionButtonText: {
    color: Colors.WHITE,
    fontFamily: Fonts.display,
    fontSize: 13,
  },
  tabsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  tabChip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
  },
  tabText: {
    fontFamily: Fonts.display,
    fontSize: 13,
  },
  paperInfo: {
    marginTop: 10,
    fontSize: 12,
    fontFamily: Fonts.body,
  },
  card: {
    borderRadius: Radii.xl,
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: Fonts.display,
    marginBottom: 10,
  },
  loadingState: {
    paddingVertical: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    fontFamily: Fonts.body,
  },
  sectionErrorBox: {
    borderWidth: 1,
    borderRadius: Radii.xl,
    padding: 16,
  },
  sectionErrorTitle: {
    fontSize: 16,
    fontFamily: Fonts.display,
    marginBottom: 4,
  },
  sectionErrorText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.body,
  },
  statusCard: {
    borderRadius: Radii.xl,
    padding: 16,
    marginBottom: 14,
  },
  statusText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.body,
  },
});
