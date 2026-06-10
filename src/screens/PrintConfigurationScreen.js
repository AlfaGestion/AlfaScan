import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import CheckBox from "expo-checkbox";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@styles/Colors";
import { Fonts, Radii, Shadow } from "@styles/Theme";
import Configuration from "@db/Configuration";
import { useThemeConfig } from "@context/ThemeContext";
import PrintPreview from "@components/print/PrintPreview";
import {
  DEFAULT_PRINT_FORMATS,
  PRINT_FORMAT_KEYS,
  buildPrintableLayout,
  createSampleProduct,
  getDefaultPrintFormat,
  loadPrintFormats,
  normalizePrintConfig,
  savePrintFormats,
  savePrintFormatsToSql,
} from "@services/printLayoutService";
import { syncPrintFormatsFromSql } from "@services/printSqlService";
import { printArticle } from "@services/printerService";

const SIZE_PRESETS = [
  { label: "80%", factor: 0.8 },
  { label: "100%", factor: 1 },
  { label: "120%", factor: 1.2 },
  { label: "150%", factor: 1.5 },
  { label: "200%", factor: 2 },
];

const ALIGNMENT_OPTIONS = [
  { label: "Izquierda", value: "left" },
  { label: "Centro", value: "center" },
  { label: "Derecha", value: "right" },
];

const clone = (value) => JSON.parse(JSON.stringify(value));

const isTextLikeElement = (element = {}) =>
  String(element?.type ?? "text").trim() !== "barcode";

const scaleFormatForPreview = (
  baseFormat = {},
  currentFormat = {},
  factor = 1,
) => {
  const align =
    String(
      (Array.isArray(currentFormat.elements)
        ? currentFormat.elements
        : []
      ).find((item) => isTextLikeElement(item))?.align ??
        currentFormat.alignment ??
        baseFormat.alignment ??
        "center",
    ).trim() || "center";
  const fontWeight =
    String(
      (Array.isArray(currentFormat.elements)
        ? currentFormat.elements
        : []
      ).find((item) => isTextLikeElement(item))?.fontWeight ?? "400",
    ).trim() === "700"
      ? "700"
      : "400";
  const italic = Boolean(
    (Array.isArray(currentFormat.elements) ? currentFormat.elements : []).find(
      (item) => isTextLikeElement(item),
    )?.italic ?? false,
  );

  const next = clone(baseFormat);
  next.alignment = align;
  next.boldPrice = fontWeight === "700";
  next.previewBeforePrint = Boolean(
    currentFormat.previewBeforePrint ?? baseFormat.previewBeforePrint ?? true,
  );
  next.elements = (Array.isArray(next.elements) ? next.elements : []).map(
    (element) => {
      if (!isTextLikeElement(element)) {
        return { ...element };
      }

      const baseFontSize = Number(element.fontSize ?? 16) || 16;
      const baseHeight = Number(element.height ?? 36) || 36;
      return {
        ...element,
        fontSize: Math.max(8, Math.round(baseFontSize * factor)),
        height: Math.max(12, Math.round(baseHeight * factor)),
        fontWeight,
        italic,
        align,
      };
    },
  );

  return next;
};

const applyGlobalTextStyle = (format = {}, patch = {}) => {
  const next = clone(format);
  next.alignment = patch.align ?? next.alignment ?? "center";
  if (patch.fontWeight) {
    next.boldPrice = patch.fontWeight === "700";
  }
  if (patch.italic !== undefined) {
    next.italic = Boolean(patch.italic);
  }

  next.elements = (Array.isArray(next.elements) ? next.elements : []).map(
    (element) => {
      if (!isTextLikeElement(element)) {
        return { ...element };
      }

      return {
        ...element,
        ...(patch.fontWeight !== undefined
          ? { fontWeight: patch.fontWeight }
          : {}),
        ...(patch.italic !== undefined
          ? { italic: Boolean(patch.italic) }
          : {}),
        ...(patch.align ? { align: patch.align } : {}),
      };
    },
  );

  return next;
};

const formatPreviewPaperInfo = (format, previewLayout) => {
  const widthLabel =
    String(format.paperWidth) === "custom"
      ? "Personalizado"
      : `${String(format.paperWidth ?? "80").trim()} mm`;
  return `${widthLabel} • alto estimado ${Math.round(Number(previewLayout?.paperHeightPx ?? 0))} px`;
};

const safeNormalizePrintConfig = (value) => {
  try {
    return normalizePrintConfig(value);
  } catch (error) {
    return {
      gondola: getDefaultPrintFormat("gondola"),
      product: getDefaultPrintFormat("product"),
      small: getDefaultPrintFormat("small"),
      custom: getDefaultPrintFormat("custom"),
    };
  }
};

export default function PrintConfigurationScreen() {
  const [formats, setFormats] = useState(() =>
    safeNormalizePrintConfig(DEFAULT_PRINT_FORMATS),
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const { darkMode } = useThemeConfig();
  const insets = useSafeAreaInsets();
  const baseFormatsRef = useRef(
    safeNormalizePrintConfig(DEFAULT_PRINT_FORMATS),
  );
  const hydratingRef = useRef(true);
  const saveTimerRef = useRef(null);

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

  const safeFormats = useMemo(
    () => safeNormalizePrintConfig(formats),
    [formats],
  );
  const formatList = useMemo(
    () =>
      PRINT_FORMAT_KEYS.map(
        (key, index) => safeFormats?.[key] || DEFAULT_PRINT_FORMATS[index],
      ),
    [safeFormats],
  );
  const activeFormat =
    formatList[activeIndex] || formatList[0] || DEFAULT_PRINT_FORMATS[0];
  const previewProduct = useMemo(() => createSampleProduct(), []);
  const previewLayout = useMemo(
    () => buildPrintableLayout(activeFormat, previewProduct),
    [activeFormat, previewProduct],
  );

  const persistFormats = useCallback(async (nextFormats) => {
    const normalized = safeNormalizePrintConfig(nextFormats);
    setSaving(true);
    try {
      await savePrintFormats(normalized);
      await savePrintFormatsToSql(normalized).catch((error) => {
        if (__DEV__) {
          console.log(
            "[PRINT_CONFIG] sql save failed",
            error?.message || error,
          );
        }
      });
      setStatus("Ajustes guardados.");
    } catch (error) {
      setStatus(error?.message || "No se pudieron guardar los ajustes.");
    } finally {
      setSaving(false);
    }
  }, []);

  const saveLocalFormats = useCallback(async () => {
    const normalized = safeNormalizePrintConfig(formats);
    setSaving(true);
    try {
      await savePrintFormats(normalized);
      setStatus("Diseños guardados localmente.");
    } catch (error) {
      setStatus(
        error?.message || "No se pudieron guardar los diseños localmente.",
      );
    } finally {
      setSaving(false);
    }
  }, [formats]);

  const syncDesignsFromSql = useCallback(async () => {
    if (syncing) {
      return;
    }

    setSyncing(true);
    setStatus("");
    try {
      const sqlFormats = await syncPrintFormatsFromSql();
      if (!sqlFormats) {
        setStatus("No se pudieron sincronizar los diseños desde SQL.");
        return;
      }

      const normalized = safeNormalizePrintConfig(sqlFormats);
      baseFormatsRef.current = clone(normalized);
      setFormats(normalized);
      setStatus("Diseños sincronizados correctamente.");
      console.log("[PRINT_SYNC] preview refreshed");
    } catch (error) {
      setStatus("No se pudieron sincronizar los diseños desde SQL.");
      if (__DEV__) {
        console.log("[PRINT_SYNC] sync failed", error?.message || error);
      }
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await loadPrintFormats();
      const normalized = safeNormalizePrintConfig(
        loaded || DEFAULT_PRINT_FORMATS,
      );
      baseFormatsRef.current = clone(normalized);
      setFormats(normalized);
      setStatus("Diseño cargado desde SQL.");
    } catch (error) {
      const fallback = safeNormalizePrintConfig(DEFAULT_PRINT_FORMATS);
      baseFormatsRef.current = clone(fallback);
      setFormats(fallback);
      setStatus(error?.message || "No se pudo cargar el diseño desde SQL.");
    } finally {
      hydratingRef.current = false;
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      return undefined;
    }, [load]),
  );

  useEffect(() => {
    if (hydratingRef.current) {
      return undefined;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      persistFormats(formats).catch(() => {});
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [formats, persistFormats]);

  useEffect(() => {
    setPreviewEnabled(Boolean(activeFormat.previewBeforePrint ?? true));
  }, [activeFormat.key, activeFormat.previewBeforePrint]);

  const updateActiveFormat = useCallback(
    (updater) => {
      setFormats((current) => {
        const normalized = safeNormalizePrintConfig(current);
        const next = { ...normalized };
        const key = PRINT_FORMAT_KEYS[activeIndex] || PRINT_FORMAT_KEYS[0];
        next[key] = updater(
          normalized[key] ||
            DEFAULT_PRINT_FORMATS[activeIndex] ||
            DEFAULT_PRINT_FORMATS[0],
        );
        return next;
      });
    },
    [activeIndex],
  );

  const applySizePreset = useCallback(
    (factor) => {
      const key = PRINT_FORMAT_KEYS[activeIndex] || PRINT_FORMAT_KEYS[0];
      updateActiveFormat((current) =>
        scaleFormatForPreview(
          baseFormatsRef.current?.[key] || current,
          current,
          factor,
        ),
      );
      setStatus(`Tamaño aplicado: ${Math.round(factor * 100)}%.`);
    },
    [activeIndex, updateActiveFormat],
  );

  const applyBold = useCallback(
    (value) => {
      updateActiveFormat((current) =>
        applyGlobalTextStyle(current, { fontWeight: value ? "700" : "400" }),
      );
      setStatus(value ? "Negrita activada." : "Negrita desactivada.");
    },
    [updateActiveFormat],
  );

  const applyItalic = useCallback(
    (value) => {
      updateActiveFormat((current) =>
        applyGlobalTextStyle(current, { italic: value }),
      );
      setStatus(value ? "Itálica activada." : "Itálica desactivada.");
    },
    [updateActiveFormat],
  );

  const applyAlignment = useCallback(
    (align) => {
      updateActiveFormat((current) => applyGlobalTextStyle(current, { align }));
      setStatus(`Alineación: ${align}.`);
    },
    [updateActiveFormat],
  );

  const handlePreviewToggle = useCallback(
    async (value) => {
      const next = Boolean(value);
      setPreviewEnabled(next);
      updateActiveFormat((current) => ({
        ...current,
        previewBeforePrint: next,
      }));
      try {
        await Configuration.createTable();
        await Configuration.setConfigValue(
          "PRINT_PREVIEW_ENABLED",
          next ? "1" : "0",
        );
      } catch (error) {
        if (__DEV__) {
          console.log(
            "[PRINT_CONFIG] preview preference save failed",
            error?.message || error,
          );
        }
      }
    },
    [updateActiveFormat],
  );

  const printTest = async () => {
    if (testing) {
      return;
    }

    setTesting(true);
    setStatus("");
    try {
      if (previewEnabled) {
        setPreviewModalVisible(true);
        setStatus("Mostrando vista previa.");
      } else {
        await printArticle({
          article: previewProduct,
          formatKey: activeFormat.key,
          format: activeFormat,
        });
        setStatus("Prueba de impresión enviada.");
      }
    } catch (error) {
      setStatus(
        error?.message ||
          "No se pudo imprimir. Revisá la impresora y volvé a intentar.",
      );
    } finally {
      setTesting(false);
    }
  };

  const handlePreviewPrintNow = async () => {
    setPreviewModalVisible(false);
    setTesting(true);
    setStatus("");
    try {
      await printArticle({
        article: previewProduct,
        formatKey: activeFormat.key,
        format: activeFormat,
      });
      setStatus("Prueba de impresión enviada.");
    } catch (error) {
      setStatus(
        error?.message ||
          "No se pudo imprimir. Revisá la impresora y volvé a intentar.",
      );
    } finally {
      setTesting(false);
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
            baseFormatsRef.current = {
              ...baseFormatsRef.current,
              [fresh.key]: fresh,
            };
            setFormats((current) => {
              const normalized = safeNormalizePrintConfig(current);
              const next = {
                ...normalized,
                [fresh.key]: fresh,
              };
              return next;
            });
            setStatus("Diseño restaurado.");
          },
        },
      ],
    );
  };

  const activeTextElement = useMemo(
    () =>
      (Array.isArray(activeFormat.elements)
        ? activeFormat.elements.find((item) => item && item.type !== "barcode")
        : null) || null,
    [activeFormat],
  );

  const previewPaperInfo = formatPreviewPaperInfo(activeFormat, previewLayout);
  const formatActionsDisabled = loading || testing || saving || syncing;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Modal
        visible={previewModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setPreviewModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: theme.surface },
              Shadow.md,
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  Vista previa de impresión
                </Text>
                <Text style={[styles.modalSubtitle, { color: theme.muted }]}>
                  Revisá el diseño antes de mandar papel.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setPreviewModalVisible(false)}
                style={[
                  styles.modalCloseButton,
                  {
                    backgroundColor: theme.surfaceAlt,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Ionicons name="close" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <View
                style={[
                  styles.previewModeWrap,
                  {
                    backgroundColor: theme.surfaceAlt,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Text style={[styles.previewModeLabel, { color: theme.text }]}>
                  {previewEnabled ? "Modo: Previsualizar" : "Modo: Imprimir"}
                </Text>
              </View>

              <PrintPreview
                title={`Formato ${activeFormat.name || activeFormat.key}`}
                format={activeFormat}
                product={previewProduct}
                editable={false}
                showGrid={false}
                showHint={false}
                theme={theme}
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.modalActionButton,
                  {
                    backgroundColor: theme.surfaceAlt,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => setPreviewModalVisible(false)}
              >
                <Text style={[styles.modalActionText, { color: theme.text }]}>
                  Cerrar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalActionButton,
                  { backgroundColor: theme.accent },
                ]}
                onPress={handlePreviewPrintNow}
              >
                <Text style={[styles.modalActionText, { color: Colors.WHITE }]}>
                  Imprimir ahora
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 28 + insets.bottom },
        ]}
      >
        <View
          style={[
            styles.headerCard,
            { backgroundColor: theme.surface },
            Shadow.md,
          ]}
        >
          <Text style={[styles.title, { color: theme.text }]}>
            Configurar impresión
          </Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>
            EditorScan define el diseño. En AlfaScan sólo ajustás tamaño,
            negrita, itálica, alineación y preview.
          </Text>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                { backgroundColor: theme.accentDark },
              ]}
              onPress={syncDesignsFromSql}
              disabled={formatActionsDisabled}
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
              <Text style={styles.actionButtonText}>Sincronizar diseños</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: "#4E7DB8" }]}
              onPress={saveLocalFormats}
              disabled={formatActionsDisabled}
            >
              <Ionicons name="save-outline" size={18} color={Colors.WHITE} />
              <Text style={styles.actionButtonText}>Guardar local</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.accent }]}
              onPress={printTest}
              disabled={formatActionsDisabled}
            >
              {testing ? (
                <ActivityIndicator color={Colors.WHITE} />
              ) : (
                <Ionicons name="print-outline" size={18} color={Colors.WHITE} />
              )}
              <Text style={styles.actionButtonText}>Imprimir prueba</Text>
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

          <View style={styles.previewToggleRow}>
            <CheckBox
              value={previewEnabled}
              onValueChange={handlePreviewToggle}
              color={darkMode ? "#8FC3FF" : Colors.DBLUE}
            />
            <Text style={[styles.previewToggleText, { color: theme.text }]}>
              Previsualizar antes de imprimir
            </Text>
          </View>

          <View style={styles.statusRow}>
            <Text style={[styles.statusText, { color: theme.muted }]}>
              {status || previewPaperInfo}
            </Text>
          </View>

          <View style={styles.tabsRow}>
            {formatList.map((item, index) => {
              const active = index === activeIndex;
              return (
                <TouchableOpacity
                  key={item.key}
                  onPress={() => setActiveIndex(index)}
                  style={[
                    styles.tabChip,
                    {
                      backgroundColor: active ? theme.accent : theme.surfaceAlt,
                      borderColor: active ? theme.accent : theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tabText,
                      { color: active ? Colors.WHITE : theme.text },
                    ]}
                  >
                    {item.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View
          style={[styles.card, { backgroundColor: theme.surface }, Shadow.sm]}
        >
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Ajustes rápidos
            </Text>
            <Text style={[styles.sectionCaption, { color: theme.muted }]}>
              Sólo texto. El layout completo vive en EditorScan.
            </Text>
          </View>

          <Text style={[styles.controlLabel, { color: theme.text }]}>
            Tamaño de letra
          </Text>
          <View style={styles.sizeRow}>
            {SIZE_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.label}
                style={[
                  styles.sizeChip,
                  {
                    backgroundColor: theme.surfaceAlt,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => applySizePreset(preset.factor)}
                disabled={formatActionsDisabled}
              >
                <Text style={[styles.sizeChipText, { color: theme.text }]}>
                  {preset.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.switchRow}>
            <CheckBox
              value={String(activeTextElement?.fontWeight ?? "400") === "700"}
              onValueChange={applyBold}
              color={darkMode ? "#8FC3FF" : Colors.DBLUE}
            />
            <Text style={[styles.switchLabel, { color: theme.text }]}>
              Negrita
            </Text>
          </View>

          <View style={styles.switchRow}>
            <CheckBox
              value={Boolean(activeTextElement?.italic)}
              onValueChange={applyItalic}
              color={darkMode ? "#8FC3FF" : Colors.DBLUE}
            />
            <Text style={[styles.switchLabel, { color: theme.text }]}>
              Itálica
            </Text>
          </View>

          <Text style={[styles.controlLabel, { color: theme.text }]}>
            Alineación
          </Text>
          <View style={styles.alignmentRow}>
            {ALIGNMENT_OPTIONS.map((option) => {
              const active =
                String(
                  activeTextElement?.align ??
                    activeFormat.alignment ??
                    "center",
                ) === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.alignmentChip,
                    {
                      backgroundColor: active ? theme.accent : theme.surfaceAlt,
                      borderColor: active ? theme.accent : theme.border,
                    },
                  ]}
                  onPress={() => applyAlignment(option.value)}
                  disabled={formatActionsDisabled}
                >
                  <Text
                    style={[
                      styles.alignmentChipText,
                      { color: active ? Colors.WHITE : theme.text },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View
          style={[styles.card, { backgroundColor: theme.surface }, Shadow.sm]}
        >
          <PrintPreview
            title="Vista previa"
            format={activeFormat}
            product={previewProduct}
            editable={false}
            showGrid={false}
            showHint={false}
            theme={theme}
          />
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
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 14,
  },
  headerCard: {
    borderRadius: Radii.lg,
    padding: 16,
  },
  card: {
    borderRadius: Radii.lg,
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontFamily: Fonts.display,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Fonts.body,
    lineHeight: 20,
  },
  headerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
  },
  actionButtonText: {
    color: Colors.WHITE,
    fontFamily: Fonts.medium,
    fontSize: 14,
  },
  previewToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
  },
  previewToggleText: {
    fontFamily: Fonts.medium,
    fontSize: 14,
  },
  statusRow: {
    marginTop: 10,
    minHeight: 20,
  },
  statusText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    lineHeight: 18,
  },
  tabsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  tabText: {
    fontFamily: Fonts.medium,
    fontSize: 13,
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: Fonts.display,
    fontSize: 18,
    marginBottom: 4,
  },
  sectionCaption: {
    fontFamily: Fonts.body,
    fontSize: 12,
  },
  controlLabel: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    marginBottom: 8,
    marginTop: 4,
  },
  sizeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  sizeChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sizeChipText: {
    fontFamily: Fonts.medium,
    fontSize: 13,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },
  switchLabel: {
    fontFamily: Fonts.medium,
    fontSize: 14,
  },
  alignmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  alignmentChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  alignmentChipText: {
    fontFamily: Fonts.medium,
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(9,15,23,0.56)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    maxHeight: "90%",
    borderRadius: 24,
    padding: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: Fonts.display,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 13,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalScroll: {
    paddingBottom: 8,
  },
  previewModeWrap: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  previewModeLabel: {
    fontFamily: Fonts.medium,
    fontSize: 13,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  modalActionButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalActionText: {
    fontFamily: Fonts.medium,
    fontSize: 14,
  },
});
