import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@styles/Colors";
import { Fonts, Radii, Shadow } from "@styles/Theme";
import { useThemeConfig } from "@context/ThemeContext";
import {
  getArticleDecimalsFromSqlConfig,
  buildPrintableLayout,
  createSampleProduct,
  getDefaultPrintDeviceConfig,
  getDefaultPrintFormat,
  loadPrintDeviceConfig,
  loadPrintFormats,
  normalizePrintDeviceConfig,
  savePrintDeviceConfig,
} from "@services/printLayoutService";
import { printArticle } from "@services/printerService";
import {
  getSunmiDiagnostics,
  printCalibrationTestPage,
} from "@services/sunmiPrinterService";

const parseIntSafe = (value, fallback = 0) => {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const Accordion = ({ title, subtitle, open, onToggle, children, theme }) => (
  <View
    style={[styles.sectionCard, { backgroundColor: theme.surface }, Shadow.sm]}
  >
    <TouchableOpacity
      style={[styles.accordionHeader, { borderColor: theme.border }]}
      onPress={onToggle}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.sectionHint, { color: theme.muted }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name={open ? "chevron-up-outline" : "chevron-down-outline"}
        size={18}
        color={theme.text}
      />
    </TouchableOpacity>
    {open ? <View style={styles.sectionBody}>{children}</View> : null}
  </View>
);

const StepButton = ({ label, onPress, theme, compact = false }) => (
  <TouchableOpacity
    style={[
      styles.stepButton,
      compact && styles.stepButtonCompact,
      { borderColor: theme.border, backgroundColor: theme.surfaceAlt },
    ]}
    onPress={onPress}
  >
    <Text
      style={[
        styles.stepButtonText,
        compact && styles.stepButtonTextCompact,
        { color: theme.text },
      ]}
      numberOfLines={1}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

const TogglePill = ({ label, value, onPress, theme }) => (
  <TouchableOpacity
    style={[
      styles.togglePill,
      {
        backgroundColor: value ? theme.accent : theme.surfaceAlt,
        borderColor: value ? theme.accent : theme.border,
      },
    ]}
    onPress={onPress}
  >
    <Text
      style={[
        styles.togglePillText,
        { color: value ? Colors.WHITE : theme.text },
      ]}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

export default function PrintCalibrationScreen({ route }) {
  const navigation = useNavigation();
  const routeFormatKey =
    String(route?.params?.formatKey ?? "product").trim() || "product";
  const routeArticle = route?.params?.article ?? route?.params?.product ?? null;

  const { darkMode } = useThemeConfig();
  const insets = useSafeAreaInsets();
  const hydratingRef = useRef(true);
  const saveTimerRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [status, setStatus] = useState("");
  const [diagnostics, setDiagnostics] = useState(null);
  const [articlePriceDecimals, setArticlePriceDecimals] = useState(2);
  const [format, setFormat] = useState(() =>
    getDefaultPrintFormat(routeFormatKey),
  );
  const [config, setConfig] = useState(() => getDefaultPrintDeviceConfig());
  const [expanded, setExpanded] = useState("quick");

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

  useLayoutEffect(() => {
    navigation.setOptions({ title: "Calibración de impresión" });
  }, [navigation]);

  const resolvedArticle = useMemo(
    () => routeArticle || createSampleProduct(),
    [routeArticle],
  );
  const resolvedLayout = useMemo(
    () =>
      buildPrintableLayout(
        format || getDefaultPrintFormat(routeFormatKey),
        resolvedArticle,
        {
          priceDecimals: articlePriceDecimals,
        },
      ),
    [articlePriceDecimals, format, routeFormatKey, resolvedArticle],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const formats = await loadPrintFormats().catch(() => null);
      const resolvedFormat =
        formats?.[routeFormatKey] || getDefaultPrintFormat(routeFormatKey);
      setFormat(resolvedFormat);
      setConfig(
        normalizePrintDeviceConfig(
          await loadPrintDeviceConfig().catch(() =>
            getDefaultPrintDeviceConfig(),
          ),
        ),
      );
      setArticlePriceDecimals(
        await getArticleDecimalsFromSqlConfig().catch(() => 2),
      );
      setDiagnostics(await getSunmiDiagnostics().catch(() => null));
      setStatus("");
    } catch (error) {
      setStatus(error?.message || "No se pudo cargar la calibración.");
    } finally {
      setLoading(false);
      hydratingRef.current = false;
    }
  }, [routeFormatKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  useEffect(() => {
    if (hydratingRef.current) {
      return undefined;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      savePrintDeviceConfig(config).catch((error) => {
        if (__DEV__) {
          console.log(
            "[PRINT_CALIBRATION] auto save failed",
            error?.message || error,
          );
        }
      });
    }, 350);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [config]);

  const updateConfig = useCallback((field, value) => {
    setStatus("");
    setConfig((current) =>
      normalizePrintDeviceConfig({
        ...current,
        [field]: value,
      }),
    );
  }, []);

  const adjustOffsetX = useCallback(
    (delta) => {
      updateConfig("offsetX", parseIntSafe(config.offsetX, 0) + delta);
    },
    [config.offsetX, updateConfig],
  );

  const adjustOffsetY = useCallback(
    (delta) => {
      updateConfig("offsetY", parseIntSafe(config.offsetY, 0) + delta);
    },
    [config.offsetY, updateConfig],
  );

  const adjustScalePercent = useCallback(
    (delta) => {
      updateConfig(
        "scalePercent",
        parseIntSafe(config.scalePercent, 100) + delta,
      );
    },
    [config.scalePercent, updateConfig],
  );

  const setScalePercent = useCallback(
    (value) => updateConfig("scalePercent", value),
    [updateConfig],
  );
  const setPrinterWidth = useCallback(
    (value) => updateConfig("printableWidthPx", value),
    [updateConfig],
  );
  const setExtraTopFeed = useCallback(
    (value) => updateConfig("extraTopFeedPx", value),
    [updateConfig],
  );
  const setExtraBottomFeed = useCallback(
    (value) => updateConfig("extraBottomFeedPx", value),
    [updateConfig],
  );
  const toggleFlag = useCallback((field) => {
    setConfig((current) =>
      normalizePrintDeviceConfig({
        ...current,
        [field]: !Boolean(current?.[field]),
      }),
    );
    setStatus("");
  }, []);

  const saveNow = useCallback(async () => {
    if (saving) {
      return;
    }

    setSaving(true);
    setStatus("");
    try {
      const normalized = await savePrintDeviceConfig(config);
      setConfig(normalized);
      setStatus("Calibración guardada solo en este dispositivo.");
    } catch (error) {
      setStatus(error?.message || "No se pudo guardar la calibración.");
    } finally {
      setSaving(false);
    }
  }, [config, saving]);

  const resetConfig = useCallback(() => {
    Alert.alert(
      "Restablecer calibración",
      "Vuelve a los valores por defecto solo en este dispositivo.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Restablecer",
          style: "destructive",
          onPress: () => {
            setConfig(getDefaultPrintDeviceConfig());
            setStatus("Valores por defecto cargados.");
          },
        },
      ],
    );
  }, []);

  const printSelectedLabel = useCallback(async () => {
    if (printing) {
      return;
    }

    setPrinting(true);
    setStatus("");
    try {
      await printArticle({
        article: resolvedArticle,
        formatKey: format?.key || routeFormatKey,
        format,
      });
      setStatus("Etiqueta seleccionada enviada a la impresora.");
    } catch (error) {
      setStatus(
        error?.message || "No se pudo imprimir la etiqueta seleccionada.",
      );
    } finally {
      setPrinting(false);
    }
  }, [format, printing, resolvedArticle, routeFormatKey]);

  const printTechnicalSheet = useCallback(async () => {
    if (printing) {
      return;
    }

    setPrinting(true);
    setStatus("");
    try {
      const pxPerMm = resolvedLayout?.paperWidthMm
        ? resolvedLayout.paperWidthPx / resolvedLayout.paperWidthMm
        : 4;
      const paperWidthMm = Math.max(
        1,
        Math.round(
          Number(
            format?.paperWidthMm ??
              format?.customPaperWidth ??
              resolvedLayout?.paperWidthMm ??
              90,
          ) || 90,
        ),
      );
      const estimatedHeightMm = Math.round(
        (Number(resolvedLayout?.paperHeightPx ?? 0) || 0) /
          Math.max(1, pxPerMm) || 60,
      );
      const paperHeightMm = Math.max(
        1,
        Math.round(
          Number(
            format?.customPaperHeight ??
              format?.paperHeightMm ??
              estimatedHeightMm ??
              60,
          ) || 60,
        ),
      );

      await printCalibrationTestPage({
        formatKey: format?.key || routeFormatKey,
        formatLabel: format?.name || routeFormatKey,
        deviceModel:
          diagnostics?.printerStatus?.printerModal ||
          diagnostics?.device?.model ||
          "",
        printerModel:
          diagnostics?.printerStatus?.printerModal ||
          diagnostics?.device?.model ||
          "",
        paperWidthPx: Math.max(
          1,
          Math.round(Number(resolvedLayout?.paperWidthPx ?? 0) || 0),
        ),
        paperHeightPx: Math.max(
          1,
          Math.round(Number(resolvedLayout?.paperHeightPx ?? 0) || 0),
        ),
        paperWidthMm,
        paperHeightMm,
        printableWidthPx: Math.max(1, Number(config.printableWidthPx) || 384),
        printScalePercent: parseIntSafe(config.scalePercent, 100),
        printOffsetX: parseIntSafe(config.offsetX, 0),
        printOffsetY: parseIntSafe(config.offsetY, 0),
      });
      setStatus("Hoja técnica enviada a la impresora.");
    } catch (error) {
      setStatus(error?.message || "No se pudo imprimir la hoja técnica.");
    } finally {
      setPrinting(false);
    }
  }, [config, diagnostics, format, printing, resolvedLayout, routeFormatKey]);

  const formatLabel =
    format?.name || format?.Nombre || format?.key || routeFormatKey;
  const articleLabel =
    resolvedArticle?.descripcion ||
    resolvedArticle?.description ||
    resolvedArticle?.name ||
    resolvedArticle?.codigoArticulo ||
    resolvedArticle?.internalCode ||
    "Artículo de prueba";
  const articlePrice = Number(
    resolvedArticle?.precio ??
      resolvedArticle?.price ??
      resolvedArticle?.price1 ??
      0,
  );
  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 28 + insets.bottom },
        ]}
      >
        <View
          style={[
            styles.heroCard,
            { backgroundColor: theme.surface },
            Shadow.sm,
          ]}
        >
          <Text style={[styles.title, { color: theme.text }]}>
            Calibración de impresión
          </Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>
            Ajustá este Sunmi sin tocar SQL ni el editor web.
          </Text>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.accent }]}
            onPress={printSelectedLabel}
            disabled={printing}
          >
            {printing ? (
              <ActivityIndicator color={Colors.WHITE} />
            ) : (
              <Ionicons name="print-outline" size={18} color={Colors.WHITE} />
            )}
            <Text style={styles.primaryButtonText}>
              Imprimir etiqueta seleccionada
            </Text>
          </TouchableOpacity>
        </View>

        <Accordion
          title="Calibración rápida"
          subtitle="Ajustes cortos para dejar esta impresora lista."
          open={expanded === "quick"}
          onToggle={() =>
            setExpanded((current) => (current === "quick" ? "" : "quick"))
          }
          theme={theme}
        >
          <Text style={[styles.quickText, { color: theme.muted }]}>
            Ajustá la impresión para este dispositivo Sunmi.
          </Text>

          <Text style={[styles.fieldLabel, { color: theme.text }]}>
            Ancho imprimible
          </Text>
          <View style={styles.widthButtonRow}>
            <TouchableOpacity
              style={[
                styles.scaleChip,
                {
                  backgroundColor:
                    Math.round(Number(config.printableWidthPx) || 384) === 384
                      ? theme.accent
                      : theme.surfaceAlt,
                  borderColor:
                    Math.round(Number(config.printableWidthPx) || 384) === 384
                      ? theme.accent
                      : theme.border,
                },
              ]}
              onPress={() => setPrinterWidth(384)}
            >
              <Text
                style={{
                  color:
                    Math.round(Number(config.printableWidthPx) || 384) === 384
                      ? Colors.WHITE
                      : theme.text,
                }}
              >
                384
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.scaleChip,
                {
                  backgroundColor:
                    Math.round(Number(config.printableWidthPx) || 384) === 576
                      ? theme.accent
                      : theme.surfaceAlt,
                  borderColor:
                    Math.round(Number(config.printableWidthPx) || 384) === 576
                      ? theme.accent
                      : theme.border,
                },
              ]}
              onPress={() => setPrinterWidth(576)}
            >
              <Text
                style={{
                  color:
                    Math.round(Number(config.printableWidthPx) || 384) === 576
                      ? Colors.WHITE
                      : theme.text,
                }}
              >
                576
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.fieldLabel, { color: theme.text }]}>
            Escala %
          </Text>
          <View
            style={[
              styles.valuePill,
              styles.valuePillEmphasis,
              { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.valuePillLabel, { color: theme.muted }]}>
              Actual
            </Text>
            <Text
              style={[
                styles.valuePillValue,
                styles.valuePillValueEmphasis,
                { color: theme.text },
              ]}
            >{`${Math.round(Number(config.scalePercent) || 100)}%`}</Text>
          </View>
          <View style={styles.stepRow}>
            <StepButton
              label="-10"
              onPress={() => adjustScalePercent(-10)}
              theme={theme}
            />
            <StepButton
              label="-5"
              onPress={() => adjustScalePercent(-5)}
              theme={theme}
            />
            <StepButton
              label="-1"
              onPress={() => adjustScalePercent(-1)}
              theme={theme}
            />
            <View
              style={[
                styles.valuePill,
                {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: theme.border,
                },
              ]}
            >
              <Text style={[styles.valuePillLabel, { color: theme.muted }]}>
                Paso
              </Text>
              <Text style={[styles.valuePillValue, { color: theme.text }]}>
                1%
              </Text>
            </View>
            <StepButton
              label="+1"
              onPress={() => adjustScalePercent(1)}
              theme={theme}
            />
            <StepButton
              label="+5"
              onPress={() => adjustScalePercent(5)}
              theme={theme}
            />
            <StepButton
              label="+10"
              onPress={() => adjustScalePercent(10)}
              theme={theme}
            />
          </View>
          <Text style={[styles.fieldLabel, { color: theme.text }]}>
            Mover izquierda / derecha
          </Text>
          <View
            style={[
              styles.valuePill,
              styles.valuePillEmphasis,
              { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.valuePillLabel, { color: theme.muted }]}>
              Actual X
            </Text>
            <Text
              style={[
                styles.valuePillValue,
                styles.valuePillValueEmphasis,
                { color: theme.text },
              ]}
            >
              {String(config.offsetX ?? 0)} px
            </Text>
          </View>
          <View style={styles.stepRow}>
            <StepButton
              label="-10"
              onPress={() => adjustOffsetX(-10)}
              theme={theme}
            />
            <StepButton
              label="-5"
              onPress={() => adjustOffsetX(-5)}
              theme={theme}
            />
            <StepButton
              label="-1"
              onPress={() => adjustOffsetX(-1)}
              theme={theme}
            />
            <StepButton
              label="+1"
              onPress={() => adjustOffsetX(1)}
              theme={theme}
            />
            <StepButton
              label="+5"
              onPress={() => adjustOffsetX(5)}
              theme={theme}
            />
            <StepButton
              label="+10"
              onPress={() => adjustOffsetX(10)}
              theme={theme}
            />
          </View>

          <Text style={[styles.fieldLabel, { color: theme.text }]}>
            Mover arriba / abajo
          </Text>
          <View
            style={[
              styles.valuePill,
              styles.valuePillEmphasis,
              { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.valuePillLabel, { color: theme.muted }]}>
              Actual Y
            </Text>
            <Text
              style={[
                styles.valuePillValue,
                styles.valuePillValueEmphasis,
                { color: theme.text },
              ]}
            >
              {String(config.offsetY ?? 0)} px
            </Text>
          </View>
          <View style={styles.stepRow}>
            <StepButton
              label="-10"
              onPress={() => adjustOffsetY(-10)}
              theme={theme}
            />
            <StepButton
              label="-5"
              onPress={() => adjustOffsetY(-5)}
              theme={theme}
            />
            <StepButton
              label="-1"
              onPress={() => adjustOffsetY(-1)}
              theme={theme}
            />
            <StepButton
              label="+1"
              onPress={() => adjustOffsetY(1)}
              theme={theme}
            />
            <StepButton
              label="+5"
              onPress={() => adjustOffsetY(5)}
              theme={theme}
            />
            <StepButton
              label="+10"
              onPress={() => adjustOffsetY(10)}
              theme={theme}
            />
          </View>

          <Text style={[styles.fieldLabel, { color: theme.text }]}>
            Quitar margen automático
          </Text>
          <TogglePill
            label={config.removeSystemMargin ? "Sí" : "No"}
            value={Boolean(config.removeSystemMargin)}
            onPress={() => toggleFlag("removeSystemMargin")}
            theme={theme}
          />

          <View style={styles.inlineActions}>
            <TouchableOpacity
              style={[
                styles.secondaryButton,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.surfaceAlt,
                },
              ]}
              onPress={saveNow}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={Colors.WHITE} />
              ) : (
                <Ionicons name="save-outline" size={18} color={theme.text} />
              )}
              <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
                Guardar calibración
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.secondaryButton,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.surfaceAlt,
                },
              ]}
              onPress={resetConfig}
            >
              <Ionicons name="refresh-outline" size={18} color={theme.text} />
              <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
                Restaurar valores
              </Text>
            </TouchableOpacity>
          </View>
        </Accordion>

        <Accordion
          title="Ajustes avanzados"
          subtitle="Solo si necesitás afinar una Sunmi específica."
          open={expanded === "advanced"}
          onToggle={() =>
            setExpanded((current) => (current === "advanced" ? "" : "advanced"))
          }
          theme={theme}
        >
          <Text style={[styles.fieldLabel, { color: theme.text }]}>
            Printer width px
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: theme.border,
                backgroundColor: theme.surfaceAlt,
                color: theme.text,
              },
            ]}
            keyboardType="numeric"
            value={String(Math.round(Number(config.printableWidthPx) || 384))}
            onEndEditing={(event) =>
              setPrinterWidth(parseIntSafe(event.nativeEvent.text, 384))
            }
            placeholder="384"
            placeholderTextColor={theme.muted}
          />

          <Text style={[styles.fieldLabel, { color: theme.text }]}>
            Offset X px
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: theme.border,
                backgroundColor: theme.surfaceAlt,
                color: theme.text,
              },
            ]}
            keyboardType="numeric"
            value={String(Math.round(Number(config.offsetX) || 0))}
            onEndEditing={(event) =>
              updateConfig("offsetX", parseIntSafe(event.nativeEvent.text, 0))
            }
            placeholder="0"
            placeholderTextColor={theme.muted}
          />

          <Text style={[styles.fieldLabel, { color: theme.text }]}>
            Offset Y px
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: theme.border,
                backgroundColor: theme.surfaceAlt,
                color: theme.text,
              },
            ]}
            keyboardType="numeric"
            value={String(Math.round(Number(config.offsetY) || 0))}
            onEndEditing={(event) =>
              updateConfig("offsetY", parseIntSafe(event.nativeEvent.text, 0))
            }
            placeholder="0"
            placeholderTextColor={theme.muted}
          />

          <Text style={[styles.fieldLabel, { color: theme.text }]}>
            Scale %
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: theme.border,
                backgroundColor: theme.surfaceAlt,
                color: theme.text,
              },
            ]}
            keyboardType="numeric"
            value={String(Math.round(Number(config.scalePercent) || 100))}
            onEndEditing={(event) =>
              setScalePercent(parseIntSafe(event.nativeEvent.text, 100))
            }
            placeholder="100"
            placeholderTextColor={theme.muted}
          />

          <Text style={[styles.fieldLabel, { color: theme.text }]}>
            Extra top feed px
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: theme.border,
                backgroundColor: theme.surfaceAlt,
                color: theme.text,
              },
            ]}
            keyboardType="numeric"
            value={String(Math.round(Number(config.extraTopFeedPx) || 0))}
            onEndEditing={(event) =>
              setExtraTopFeed(parseIntSafe(event.nativeEvent.text, 0))
            }
            placeholder="0"
            placeholderTextColor={theme.muted}
          />

          <Text style={[styles.fieldLabel, { color: theme.text }]}>
            Extra bottom feed px
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: theme.border,
                backgroundColor: theme.surfaceAlt,
                color: theme.text,
              },
            ]}
            keyboardType="numeric"
            value={String(Math.round(Number(config.extraBottomFeedPx) || 0))}
            onEndEditing={(event) =>
              setExtraBottomFeed(parseIntSafe(event.nativeEvent.text, 0))
            }
            placeholder="0"
            placeholderTextColor={theme.muted}
          />

          <Text style={[styles.fieldLabel, { color: theme.text }]}>
            Auto center
          </Text>
          <TogglePill
            label={config.autoCenter ? "Sí" : "No"}
            value={Boolean(config.autoCenter)}
            onPress={() => toggleFlag("autoCenter")}
            theme={theme}
          />

          <Text style={[styles.fieldLabel, { color: theme.text }]}>
            Remove system margin
          </Text>
          <TogglePill
            label={config.removeSystemMargin ? "Sí" : "No"}
            value={Boolean(config.removeSystemMargin)}
            onPress={() => toggleFlag("removeSystemMargin")}
            theme={theme}
          />
        </Accordion>

        <Accordion
          title="Hoja técnica"
          subtitle="Diagnóstico rápido con borde, regla y datos técnicos."
          open={expanded === "technical"}
          onToggle={() =>
            setExpanded((current) =>
              current === "technical" ? "" : "technical",
            )
          }
          theme={theme}
        >
          <View style={styles.techBlock}>
            <Text style={[styles.techText, { color: theme.muted }]}>
              Esta hoja sirve solo para diagnóstico. La calibración principal
              sigue siendo la etiqueta real seleccionada.
            </Text>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: theme.accentDark },
              ]}
              onPress={printTechnicalSheet}
              disabled={printing}
            >
              {printing ? (
                <ActivityIndicator color={Colors.WHITE} />
              ) : (
                <Ionicons
                  name="document-outline"
                  size={18}
                  color={Colors.WHITE}
                />
              )}
              <Text style={styles.primaryButtonText}>
                Imprimir hoja técnica
              </Text>
            </TouchableOpacity>
          </View>
        </Accordion>

        <View
          style={[styles.card, { backgroundColor: theme.surface }, Shadow.sm]}
        >
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Resumen
          </Text>
          <Text style={[styles.statusText, { color: theme.muted }]}>
            {loading
              ? "Cargando..."
              : status ||
                `${format?.name || routeFormatKey} · ${articleLabel} · ${Number.isFinite(articlePrice) ? articlePrice.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: articlePriceDecimals, maximumFractionDigits: articlePriceDecimals }) : ""}`}
          </Text>
          <Text style={[styles.statusText, { color: theme.muted }]}>
            {diagnostics?.device?.model ||
              diagnostics?.printerStatus?.printerModal ||
              "Sin datos de modelo"}
          </Text>
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
  sectionCard: {
    borderRadius: Radii.lg,
    overflow: "hidden",
  },
  accordionHeader: {
    padding: 16,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sectionBody: {
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
  secondaryButton: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    flexGrow: 1,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontFamily: Fonts.body,
    fontWeight: "600",
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
  quickText: {
    fontSize: 13,
    fontFamily: Fonts.body,
    lineHeight: 18,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: Fonts.title,
    fontWeight: "700",
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: Fonts.body,
  },
  widthButtonRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 8,
  },
  scaleChip: {
    minWidth: 58,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  stepButton: {
    minHeight: 40,
    minWidth: 54,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  stepButtonCompact: {
    minWidth: 48,
    paddingHorizontal: 8,
  },
  stepButtonText: {
    fontSize: 14,
    fontFamily: Fonts.title,
    fontWeight: "700",
  },
  stepButtonTextCompact: {
    fontSize: 12,
  },
  valuePill: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  valuePillEmphasis: {
    minHeight: 48,
    paddingVertical: 4,
  },
  valuePillLabel: {
    fontSize: 12,
    fontFamily: Fonts.body,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  valuePillValue: {
    fontSize: 14,
    fontFamily: Fonts.title,
    fontWeight: "700",
  },
  valuePillValueEmphasis: {
    fontSize: 20,
    fontWeight: "800",
  },
  togglePill: {
    minWidth: 74,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  togglePillText: {
    fontSize: 13,
    fontFamily: Fonts.title,
    fontWeight: "700",
  },
  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  techBlock: {
    gap: 12,
  },
  techText: {
    fontSize: 13,
    fontFamily: Fonts.body,
    lineHeight: 18,
  },
  statusText: {
    fontSize: 13,
    fontFamily: Fonts.body,
    lineHeight: 18,
  },
});
