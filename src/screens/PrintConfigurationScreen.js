import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ConfigItem from "@components/ConfigItem";
import Colors from "@styles/Colors";
import { Fonts, Radii, Shadow } from "@styles/Theme";
import { useThemeConfig } from "@context/ThemeContext";
import { DEFAULT_PRINT_FORMATS, loadPrintFormats, savePrintFormats } from "@services/printFormats";

const PAPER_OPTIONS = [
  { label: "58 mm", value: "58" },
  { label: "80 mm", value: "80" },
  { label: "Personalizado", value: "custom" },
];

const ALIGNMENT_OPTIONS = [
  { label: "Izquierda", value: "left" },
  { label: "Centro", value: "center" },
  { label: "Derecha", value: "right" },
];

const formatPreviewDate = () =>
  new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());

const normalizeFormat = (format = {}, fallback = {}) => ({
  ...fallback,
  ...format,
  name: String(format.name ?? fallback.name ?? ""),
  paperWidth: String(format.paperWidth ?? fallback.paperWidth ?? "80"),
  customPaperWidth: String(format.customPaperWidth ?? fallback.customPaperWidth ?? ""),
  descriptionFontSize: String(format.descriptionFontSize ?? fallback.descriptionFontSize ?? "16"),
  priceFontSize: String(format.priceFontSize ?? fallback.priceFontSize ?? "24"),
  copies: String(format.copies ?? fallback.copies ?? "1"),
  marginTop: String(format.marginTop ?? fallback.marginTop ?? "0"),
  marginBottom: String(format.marginBottom ?? fallback.marginBottom ?? "0"),
  alignment: String(format.alignment ?? fallback.alignment ?? "center"),
  showDescription: Boolean(format.showDescription ?? fallback.showDescription),
  showPrice: Boolean(format.showPrice ?? fallback.showPrice),
  showBarcode: Boolean(format.showBarcode ?? fallback.showBarcode),
  showStock: Boolean(format.showStock ?? fallback.showStock),
  showDate: Boolean(format.showDate ?? fallback.showDate),
  showCompanyName: Boolean(format.showCompanyName ?? fallback.showCompanyName),
  showInternalCode: Boolean(format.showInternalCode ?? fallback.showInternalCode),
  boldPrice: Boolean(format.boldPrice ?? fallback.boldPrice),
  previewBeforePrint: Boolean(format.previewBeforePrint ?? fallback.previewBeforePrint),
});

const paperWidthToPx = (format) => {
  if (String(format.paperWidth) === "58") return 240;
  if (String(format.paperWidth) === "80") return 320;
  const custom = parseInt(String(format.customPaperWidth ?? "").trim(), 10);
  if (Number.isFinite(custom) && custom >= 200) return Math.min(custom, 420);
  return 280;
};

const BarcodePreview = ({ darkMode, theme }) => (
  <View style={[styles.barcodeBox, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
    <View style={styles.barcodeBars}>
      {Array.from({ length: 18 }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.barcodeBar,
            {
              width: index % 3 === 0 ? 3 : index % 2 === 0 ? 2 : 1,
              height: index % 4 === 0 ? 26 : 20,
              backgroundColor: darkMode ? "#E8F0F8" : "#1B1B1B",
            },
          ]}
        />
      ))}
    </View>
    <Text style={[styles.barcodeText, { color: theme.text }]}>1234567890123</Text>
  </View>
);

const FormatTabs = ({ formats, activeIndex, onChange, theme }) => (
  <View style={styles.tabsRow}>
    {formats.map((item, index) => {
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

export default function PrintConfigurationScreen() {
  const [formats, setFormats] = useState(DEFAULT_PRINT_FORMATS);
  const [activeIndex, setActiveIndex] = useState(0);
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
    [darkMode]
  );

  const load = useCallback(async () => {
    const data = await loadPrintFormats();
    setFormats(data.map((item, index) => normalizeFormat(item, DEFAULT_PRINT_FORMATS[index])));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const activeFormat = formats[activeIndex] || formats[0] || DEFAULT_PRINT_FORMATS[0];
  const effectiveWidth = paperWidthToPx(activeFormat);

  const updateFormat = (field, value) => {
    setFormats((current) =>
      current.map((item, index) => (index === activeIndex ? { ...item, [field]: value } : item))
    );
  };

  const save = async () => {
    await savePrintFormats(formats);
  };

  const previewStyle = {
    width: effectiveWidth,
    maxWidth: "100%",
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 28 + insets.bottom }]}>
        <View style={[styles.card, { backgroundColor: theme.surface }, Shadow.sm]}>
          <Text style={[styles.title, { color: theme.text }]}>Configurar impresión</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>
            Edite cada formato y vea el ticket en vivo antes de imprimir.
          </Text>

          <FormatTabs formats={formats} activeIndex={activeIndex} onChange={setActiveIndex} theme={theme} />

          <View style={[styles.editorCard, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
            <ConfigItem type="input" title="Nombre" field="name" placeholder="Góndola" value={activeFormat.name} handleChange={updateFormat} darkMode={darkMode} />
            <ConfigItem
              type="select"
              title="Ancho papel"
              field="paperWidth"
              value={activeFormat.paperWidth}
              options={PAPER_OPTIONS}
              handleChange={updateFormat}
              darkMode={darkMode}
            />
            {String(activeFormat.paperWidth) === "custom" ? (
              <ConfigItem type="input" title="Ancho personalizado" field="customPaperWidth" placeholder="320" value={activeFormat.customPaperWidth || ""} keyboardType="numeric" handleChange={updateFormat} darkMode={darkMode} />
            ) : null}
            <ConfigItem type="input" title="Tamaño fuente descripción" field="descriptionFontSize" placeholder="16" value={activeFormat.descriptionFontSize} keyboardType="numeric" handleChange={updateFormat} darkMode={darkMode} />
            <ConfigItem type="input" title="Tamaño fuente precio" field="priceFontSize" placeholder="24" value={activeFormat.priceFontSize} keyboardType="numeric" handleChange={updateFormat} darkMode={darkMode} />
            <ConfigItem type="select" title="Alineación" field="alignment" value={activeFormat.alignment} options={ALIGNMENT_OPTIONS} handleChange={updateFormat} darkMode={darkMode} />
            <ConfigItem type="input" title="Cantidad de copias" field="copies" placeholder="1" value={activeFormat.copies} keyboardType="numeric" handleChange={updateFormat} darkMode={darkMode} />
            <ConfigItem type="input" title="Margen superior" field="marginTop" placeholder="0" value={activeFormat.marginTop} keyboardType="numeric" handleChange={updateFormat} darkMode={darkMode} />
            <ConfigItem type="input" title="Margen inferior" field="marginBottom" placeholder="0" value={activeFormat.marginBottom} keyboardType="numeric" handleChange={updateFormat} darkMode={darkMode} />
            <ConfigItem type="checkbox" title="Mostrar descripción" field="showDescription" value={activeFormat.showDescription} handleChange={updateFormat} darkMode={darkMode} />
            <ConfigItem type="checkbox" title="Mostrar precio" field="showPrice" value={activeFormat.showPrice} handleChange={updateFormat} darkMode={darkMode} />
            <ConfigItem type="checkbox" title="Mostrar código de barra" field="showBarcode" value={activeFormat.showBarcode} handleChange={updateFormat} darkMode={darkMode} />
            <ConfigItem type="checkbox" title="Mostrar stock" field="showStock" value={activeFormat.showStock} handleChange={updateFormat} darkMode={darkMode} />
            <ConfigItem type="checkbox" title="Mostrar fecha" field="showDate" value={activeFormat.showDate} handleChange={updateFormat} darkMode={darkMode} />
            <ConfigItem type="checkbox" title="Mostrar empresa" field="showCompanyName" value={activeFormat.showCompanyName} handleChange={updateFormat} darkMode={darkMode} />
            <ConfigItem type="checkbox" title="Mostrar código interno" field="showInternalCode" value={activeFormat.showInternalCode} handleChange={updateFormat} darkMode={darkMode} />
            <ConfigItem type="checkbox" title="Negrita precio" field="boldPrice" value={activeFormat.boldPrice} handleChange={updateFormat} darkMode={darkMode} />
            <ConfigItem type="checkbox" title="Vista previa antes de imprimir" field="previewBeforePrint" value={activeFormat.previewBeforePrint} handleChange={updateFormat} darkMode={darkMode} />
          </View>

          <TouchableOpacity style={[styles.saveButton, { backgroundColor: theme.accentDark }]} onPress={save}>
            <Ionicons name="save-outline" size={18} color={Colors.WHITE} />
            <Text style={styles.saveButtonText}>Guardar formatos</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.previewWrap, { backgroundColor: theme.surface }, Shadow.sm]}>
          <Text style={[styles.previewTitle, { color: theme.text }]}>Vista previa</Text>
          <View style={[styles.previewPaper, { width: previewStyle.width, backgroundColor: Colors.WHITE, borderColor: theme.border }]}>
            <Text
              style={[
                styles.previewDescription,
                {
                  fontSize: Number(activeFormat.descriptionFontSize || 16),
                  textAlign: activeFormat.alignment,
                },
              ]}
            >
              {activeFormat.showDescription ? activeFormat.name || "Descripción" : " "}
            </Text>
            {activeFormat.showPrice ? (
              <Text
                style={[
                  styles.previewPrice,
                  {
                    fontSize: Number(activeFormat.priceFontSize || 24),
                    textAlign: activeFormat.alignment,
                    fontWeight: activeFormat.boldPrice ? "700" : "400",
                  },
                ]}
              >
                $ 12.345,67
              </Text>
            ) : null}
            {activeFormat.showBarcode ? <BarcodePreview darkMode={false} theme={theme} /> : null}
            {activeFormat.showStock ? <Text style={[styles.previewMeta, { color: theme.text }]}>Stock: 12</Text> : null}
            {activeFormat.showDate ? <Text style={[styles.previewMeta, { color: theme.text }]}>{formatPreviewDate()}</Text> : null}
            {activeFormat.showCompanyName ? <Text style={[styles.previewMeta, { color: theme.text }]}>AlfaScan</Text> : null}
            {activeFormat.showInternalCode ? <Text style={[styles.previewMeta, { color: theme.text }]}>Cod. interno: A123</Text> : null}
          </View>
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
    paddingBottom: 28,
  },
  card: {
    borderRadius: Radii.xl,
    padding: 18,
    marginBottom: 14,
  },
  title: {
    fontSize: 22,
    fontFamily: Fonts.display,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.body,
    marginBottom: 12,
  },
  tabsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
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
  editorCard: {
    borderWidth: 1,
    borderRadius: Radii.lg,
    padding: 14,
  },
  saveButton: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  saveButtonText: {
    color: Colors.WHITE,
    fontFamily: Fonts.display,
    fontSize: 14,
  },
  previewWrap: {
    borderRadius: Radii.xl,
    padding: 18,
  },
  previewTitle: {
    fontSize: 18,
    fontFamily: Fonts.display,
    marginBottom: 12,
  },
  previewPaper: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 14,
    alignSelf: "center",
  },
  previewDescription: {
    color: "#111827",
    marginBottom: 8,
    fontFamily: Fonts.display,
  },
  previewPrice: {
    color: "#0B5FA5",
    marginBottom: 10,
    fontFamily: Fonts.display,
  },
  previewMeta: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: Fonts.body,
  },
  barcodeBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginTop: 6,
  },
  barcodeBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 3,
  },
  barcodeBar: {
    borderRadius: 1,
  },
  barcodeText: {
    textAlign: "center",
    fontSize: 11,
    marginTop: 6,
    fontFamily: Fonts.mono,
  },
});
