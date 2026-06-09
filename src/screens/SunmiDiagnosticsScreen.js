import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@styles/Colors";
import { Fonts, Radii, Shadow } from "@styles/Theme";
import { useThemeConfig } from "@context/ThemeContext";
import { getSunmiDiagnostics, printSunmiDiagnosticTest } from "@services/sunmiPrinterService";

const InfoRow = ({ label, value, theme }) => (
  <View style={[styles.infoRow, { borderColor: theme.border }]}>
    <Text style={[styles.infoLabel, { color: theme.muted }]}>{label}</Text>
    <Text style={[styles.infoValue, { color: theme.text }]} numberOfLines={4}>
      {value}
    </Text>
  </View>
);

const Section = ({ title, children, theme }) => (
  <View style={[styles.card, { backgroundColor: theme.surface }, Shadow.sm]}>
    <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
    {children}
  </View>
);

const formatBool = (value) => (value ? "Sí" : "No");

export default function SunmiDiagnosticsScreen() {
  const [diagnostics, setDiagnostics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState("");
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
      success: "#1F8B4C",
      danger: "#D64545",
    }),
    [darkMode],
  );

  const loadDiagnostics = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSunmiDiagnostics();
      setDiagnostics(data);
      setResult("");
    } catch (error) {
      setDiagnostics(null);
      setResult(error?.message || String(error || "No se pudieron leer los diagnósticos."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDiagnostics();
  }, [loadDiagnostics]);

  useFocusEffect(
    useCallback(() => {
      loadDiagnostics();
    }, [loadDiagnostics]),
  );

  const handlePrintTest = useCallback(async () => {
    if (testing) {
      return;
    }

    setTesting(true);
    setResult("");
    try {
      const output = await printSunmiDiagnosticTest();
      setResult(`Impresión exitosa. Líneas impresas: ${output?.printed?.length || 0}.`);
      await loadDiagnostics();
    } catch (error) {
      const message = String(error?.message || error || "");
      if (/sdk.*no.*instal/i.test(message)) {
        setResult(`SDK no instalado. ${message}`);
      } else if (/bind/i.test(message)) {
        setResult(`Error de bind. ${message}`);
      } else if (/servicio no encontrado/i.test(message)) {
        setResult(`Servicio no encontrado. ${message}`);
      } else if (/papel/i.test(message)) {
        setResult(`Sin papel. ${message}`);
      } else {
        setResult(message || "Error desconocido al imprimir.");
      }
      await loadDiagnostics();
    } finally {
      setTesting(false);
    }
  }, [loadDiagnostics, testing]);

  const printerLabel = diagnostics?.printerStatus?.mode || "Desconocido";
  const paperPresent = Boolean(diagnostics?.paperPresent);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 28 + insets.bottom }]}>
        <View style={[styles.heroCard, { backgroundColor: theme.surface }, Shadow.md]}>
          <Text style={[styles.title, { color: theme.text }]}>Diagnóstico Sunmi</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>
            Revisa detección, bind, hardware y prueba de impresión sin ocultar excepciones.
          </Text>

          <TouchableOpacity
            style={[styles.printButton, { backgroundColor: theme.accent }]}
            onPress={handlePrintTest}
            disabled={testing}
          >
            {testing ? <ActivityIndicator color={Colors.WHITE} /> : <Ionicons name="print-outline" size={18} color={Colors.WHITE} />}
            <Text style={styles.printButtonText}>Probar impresión</Text>
          </TouchableOpacity>
        </View>

        <Section title="Dispositivo" theme={theme}>
          <InfoRow label="Fabricante dispositivo" value={diagnostics?.device?.manufacturer || "-"} theme={theme} />
          <InfoRow label="Modelo dispositivo" value={diagnostics?.device?.model || "-"} theme={theme} />
          <InfoRow label="Android version" value={diagnostics?.device?.androidVersion || "-"} theme={theme} />
          <InfoRow label="Package name" value={diagnostics?.device?.packageName || "-"} theme={theme} />
        </Section>

        <Section title="Sunmi / impresora" theme={theme}>
          <InfoRow label="¿Es dispositivo Sunmi?" value={formatBool(Boolean(diagnostics?.isSunmiDevice))} theme={theme} />
          <InfoRow
            label="¿Existe servicio InnerPrinter?"
            value={formatBool(Boolean(diagnostics?.innerPrinterAvailable))}
            theme={theme}
          />
          <InfoRow
            label="¿Se pudo hacer bind al servicio?"
            value={formatBool(Boolean(diagnostics?.bindStatus?.success))}
            theme={theme}
          />
          <InfoRow label="Estado impresora" value={printerLabel} theme={theme} />
          <InfoRow label="Papel presente" value={formatBool(paperPresent)} theme={theme} />
        </Section>

        <Section title="Detalle técnico" theme={theme}>
          <InfoRow label="Versión impresora" value={diagnostics?.printerStatus?.printerVersion || "-"} theme={theme} />
          <InfoRow label="Modelo impresora" value={diagnostics?.printerStatus?.printerModal || "-"} theme={theme} />
          <InfoRow label="Serial impresora" value={diagnostics?.printerStatus?.printerSerialNo || "-"} theme={theme} />
          <InfoRow label="SDK constants" value={diagnostics?.constants?.__constantsError || "Disponibles"} theme={theme} />
          <InfoRow label="Error actual" value={diagnostics?.error || diagnostics?.bindStatus?.error || "-"} theme={theme} />
        </Section>

        <Section title="Resultado" theme={theme}>
          <View style={[styles.resultBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={theme.accent} />
                <Text style={[styles.loadingText, { color: theme.muted }]}>Cargando diagnóstico...</Text>
              </View>
            ) : (
              <Text style={[styles.resultText, { color: theme.text }]}>{result || "Sin ejecución de prueba todavía."}</Text>
            )}
          </View>
        </Section>
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
  },
  heroCard: {
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
  printButton: {
    minHeight: 48,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
  },
  printButtonText: {
    color: Colors.WHITE,
    fontFamily: Fonts.display,
    fontSize: 14,
  },
  card: {
    borderRadius: Radii.xl,
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: Fonts.display,
    marginBottom: 12,
  },
  infoRow: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: Fonts.body,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  infoValue: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: Fonts.body,
  },
  resultBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    minHeight: 80,
  },
  resultText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.body,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: Fonts.body,
  },
});
