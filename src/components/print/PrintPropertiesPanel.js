import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import CheckBox from "expo-checkbox";

import Colors from "@styles/Colors";
import { Fonts, Radii } from "@styles/Theme";
import { PRINT_ALIGNMENT_OPTIONS } from "@services/printLayoutService";

const QUICK_ACTIONS = [
  { key: "fontUp", label: "Agrandar letra" },
  { key: "fontDown", label: "Achicar letra" },
  { key: "moveUp", label: "Mover arriba" },
  { key: "moveDown", label: "Mover abajo" },
  { key: "moveLeft", label: "Mover izquierda" },
  { key: "moveRight", label: "Mover derecha" },
  { key: "centerX", label: "Centrar horizontal" },
  { key: "centerY", label: "Centrar vertical" },
  { key: "bringFront", label: "Traer al frente" },
  { key: "sendBack", label: "Enviar atrás" },
];

const NumericField = ({ label, value, onChange, placeholder = "0", darkMode, keyboardType = "numeric" }) => (
  <View style={styles.fieldBlock}>
    <Text style={[styles.label, darkMode && styles.labelDark]}>{label}</Text>
    <TextInput
      style={[styles.input, darkMode && styles.inputDark]}
      value={String(value ?? "")}
      placeholder={placeholder}
      placeholderTextColor={darkMode ? "#9CB2C8" : Colors.MUTED}
      keyboardType={keyboardType}
      onChangeText={onChange}
    />
  </View>
);

const TextField = ({ label, value, onChange, placeholder = "", darkMode, multiline = false }) => (
  <View style={styles.fieldBlock}>
    <Text style={[styles.label, darkMode && styles.labelDark]}>{label}</Text>
    <TextInput
      style={[styles.input, multiline && styles.multiline, darkMode && styles.inputDark]}
      value={String(value ?? "")}
      placeholder={placeholder}
      placeholderTextColor={darkMode ? "#9CB2C8" : Colors.MUTED}
      onChangeText={onChange}
      multiline={multiline}
    />
  </View>
);

const ToggleRow = ({ label, value, onChange, darkMode }) => (
  <View style={styles.toggleRow}>
    <Text style={[styles.label, darkMode && styles.labelDark]}>{label}</Text>
    <CheckBox
      value={Boolean(value)}
      onValueChange={onChange}
      color={darkMode ? "#8FC3FF" : Colors.DBLUE}
    />
  </View>
);

const SegmentGroup = ({ label, options, value, onChange, darkMode }) => (
  <View style={styles.fieldBlock}>
    <Text style={[styles.label, darkMode && styles.labelDark]}>{label}</Text>
    <View style={styles.segmentRow}>
      {options.map((item) => {
        const active = String(value ?? "") === String(item.value);
        return (
          <TouchableOpacity
            key={`${label}-${item.value}`}
            onPress={() => onChange(item.value)}
            style={[
              styles.segmentButton,
              {
                backgroundColor: active ? "#1E88E5" : darkMode ? "#152332" : Colors.SURFACE,
                borderColor: active ? "#1E88E5" : darkMode ? "#243241" : Colors.BORDER,
              },
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: active ? Colors.WHITE : darkMode ? "#E8F0F8" : Colors.DGREY },
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
);

const QuickActionButton = ({ label, onPress, darkMode }) => (
  <TouchableOpacity
    onPress={onPress}
    style={[styles.quickButton, darkMode && styles.quickButtonDark]}
  >
    <Text style={[styles.quickButtonText, darkMode && styles.quickButtonTextDark]}>{label}</Text>
  </TouchableOpacity>
);

export default function PrintPropertiesPanel({
  element,
  onChange,
  onQuickAction,
  onToggleVisible,
  theme,
  darkMode,
}) {
  if (!element) {
    return (
      <View style={[styles.emptyBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
        <Text style={[styles.emptyTitle, { color: theme.text }]}>Seleccioná un elemento</Text>
        <Text style={[styles.emptyText, { color: theme.muted }]}>
          Tocá cualquier bloque de la vista previa para editarlo.
        </Text>
      </View>
    );
  }

  const isBarcode = element.type === "barcode";
  const isLogo = element.type === "logo";

  return (
    <View style={[styles.panel, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>{element.label}</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>Clave: {element.key}</Text>
        </View>
        <View style={styles.visibleWrap}>
          <Text style={[styles.visibleLabel, { color: theme.text }]}>Visible</Text>
          <CheckBox
            value={Boolean(element.visible)}
            onValueChange={onToggleVisible}
            color={darkMode ? "#8FC3FF" : Colors.DBLUE}
          />
        </View>
      </View>

      <View style={styles.quickGrid}>
        {QUICK_ACTIONS.map((action) => (
          <QuickActionButton
            key={action.key}
            label={action.label}
            onPress={() => onQuickAction(action.key)}
            darkMode={darkMode}
          />
        ))}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Texto y estilo</Text>
        <TextField
          label="Texto de prueba"
          value={element.sampleText}
          onChange={(value) => onChange("sampleText", value)}
          placeholder={element.label}
          darkMode={darkMode}
          multiline={false}
        />
        <NumericField
          label="Tamaño de letra"
          value={element.fontSize}
          onChange={(value) => onChange("fontSize", value)}
          darkMode={darkMode}
        />
        <ToggleRow
          label="Negrita"
          value={String(element.fontWeight) === "700"}
          onChange={(value) => onChange("fontWeight", value ? "700" : "400")}
          darkMode={darkMode}
        />
        <ToggleRow
          label="Mayúsculas"
          value={Boolean(element.uppercase)}
          onChange={(value) => onChange("uppercase", value)}
          darkMode={darkMode}
        />
        <NumericField
          label="Máximo de líneas"
          value={element.maxLines}
          onChange={(value) => onChange("maxLines", value)}
          darkMode={darkMode}
        />
        <TextField
          label="Color"
          value={element.color}
          onChange={(value) => onChange("color", value)}
          placeholder="#111827"
          darkMode={darkMode}
        />
        <SegmentGroup
          label="Alineación"
          options={PRINT_ALIGNMENT_OPTIONS}
          value={element.align}
          onChange={(value) => onChange("align", value)}
          darkMode={darkMode}
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Posición y tamaño</Text>
        <View style={styles.grid2}>
          <NumericField
            label="X"
            value={element.x}
            onChange={(value) => onChange("x", value)}
            darkMode={darkMode}
          />
          <NumericField
            label="Y"
            value={element.y}
            onChange={(value) => onChange("y", value)}
            darkMode={darkMode}
          />
        </View>
        <View style={styles.grid2}>
          <NumericField
            label="Ancho"
            value={element.width}
            onChange={(value) => onChange("width", value)}
            darkMode={darkMode}
          />
          <NumericField
            label="Alto"
            value={element.height}
            onChange={(value) => onChange("height", value)}
            darkMode={darkMode}
          />
        </View>
      </View>

      {element.key === "price" ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Precio</Text>
          <ToggleRow
            label="Mostrar símbolo $"
            value={Boolean(element.showSymbol)}
            onChange={(value) => onChange("showSymbol", value)}
            darkMode={darkMode}
          />
          <ToggleRow
            label="Separador de miles"
            value={Boolean(element.thousandSeparator)}
            onChange={(value) => onChange("thousandSeparator", value)}
            darkMode={darkMode}
          />
          <NumericField
            label="Cantidad de decimales"
            value={element.decimals}
            onChange={(value) => onChange("decimals", value)}
            darkMode={darkMode}
          />
        </View>
      ) : null}

      {isBarcode ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Código de barra</Text>
          <ToggleRow
            label="Mostrar número debajo"
            value={Boolean(element.showNumber)}
            onChange={(value) => onChange("showNumber", value)}
            darkMode={darkMode}
          />
          <SegmentGroup
            label="Tipo"
            options={[
              { label: "EAN13", value: "EAN13" },
              { label: "CODE128", value: "CODE128" },
              { label: "Automático", value: "AUTO" },
            ]}
            value={element.barcodeType}
            onChange={(value) => onChange("barcodeType", value)}
            darkMode={darkMode}
          />
        </View>
      ) : null}

      {isLogo ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Logo</Text>
          <Text style={[styles.logoHint, { color: theme.muted }]}>
            El logo se usa como referencia visual en la vista previa. En la impresión real puede resolverse según el motor disponible.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderRadius: Radii.xl,
    padding: 14,
  },
  emptyBox: {
    borderWidth: 1,
    borderRadius: Radii.xl,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 180,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: Fonts.display,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.body,
    textAlign: "center",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: Fonts.display,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: Fonts.body,
  },
  visibleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  visibleLabel: {
    fontSize: 13,
    fontFamily: Fonts.body,
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  quickButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    justifyContent: "center",
    backgroundColor: Colors.WHITE,
    borderWidth: 1,
    borderColor: Colors.BORDER,
  },
  quickButtonDark: {
    backgroundColor: "#152332",
    borderColor: "#243241",
  },
  quickButtonText: {
    fontSize: 12,
    fontFamily: Fonts.display,
    color: Colors.DGREY,
  },
  quickButtonTextDark: {
    color: "#E8F0F8",
  },
  section: {
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: Fonts.display,
    marginBottom: 8,
  },
  fieldBlock: {
    marginBottom: 10,
  },
  label: {
    fontSize: 13,
    fontFamily: Fonts.body,
    marginBottom: 6,
  },
  labelDark: {
    color: "#E8F0F8",
  },
  input: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    backgroundColor: Colors.WHITE,
    paddingHorizontal: 12,
    color: Colors.DGREY,
    fontFamily: Fonts.body,
  },
  inputDark: {
    backgroundColor: "#152332",
    borderColor: "#243241",
    color: "#E8F0F8",
  },
  multiline: {
    minHeight: 60,
    textAlignVertical: "top",
    paddingTop: 10,
  },
  toggleRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  segmentButton: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentText: {
    fontSize: 12,
    fontFamily: Fonts.display,
  },
  grid2: {
    flexDirection: "row",
    gap: 10,
  },
  logoHint: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: Fonts.body,
  },
});
