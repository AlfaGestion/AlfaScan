import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";

import Colors from "@styles/Colors";
import { Fonts, Radii, Shadow } from "@styles/Theme";
import { useThemeConfig } from "@context/ThemeContext";
import Configuration from "@db/Configuration";
import { syncCatalogToLocal } from "@services/catalogService";

const formatDateTime = (value) => {
  if (!value) {
    return "Sin sincronizacion registrada";
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

export default function SyncScreen({ navigation }) {
  const [status, setStatus] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [mode, setMode] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState("");
  const { darkMode } = useThemeConfig();

  const loadStatus = useCallback(async () => {
    try {
      await Configuration.createTable();
      const currentConnectionType = await Configuration.getConfigValue("CONNECTION_TYPE");
      const currentMode = await Configuration.getConfigValue("SQL_MODE");
      const syncValue = await Configuration.getConfigValue("LAST_SYNC_AT");
      const normalizedConnectionType = String(currentConnectionType ?? "").trim().toUpperCase();
      const normalizedMode = String(currentMode ?? "").trim().toUpperCase();
      setMode(normalizedConnectionType || normalizedMode || "LOCAL");
      setLastSyncAt(String(syncValue ?? "").trim());
    } catch (e) {
      setMode("LOCAL");
      setLastSyncAt("");
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useFocusEffect(
    useCallback(() => {
      loadStatus();
    }, [loadStatus])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerStyle: { backgroundColor: darkMode ? "#16212D" : "#DDEAF8" },
      headerTintColor: darkMode ? "#E8F0F8" : "#1A395A",
      headerTitleStyle: { color: darkMode ? "#E8F0F8" : "#1A395A", fontWeight: "700" },
    });
  }, [navigation, darkMode]);

  const handleSync = async () => {
    setSyncing(true);
    setStatus("");

    try {
      const result = await syncCatalogToLocal({
        onProgress: ({ inserted, page }) => {
          setStatus(`Sincronizando catalogo... ${inserted} registros importados (lote ${page}).`);
        },
      });

      const syncValue = new Date().toISOString();
      await Configuration.setConfigValue("LAST_SYNC_AT", syncValue);
      setLastSyncAt(syncValue);
      setStatus(`Sincronizacion completada. Registros importados: ${result.inserted}.`);
    } catch (e) {
      setStatus(e?.message || "No se pudo sincronizar el catalogo.");
    } finally {
      setSyncing(false);
    }
  };

  const theme = {
    background: darkMode ? "#0F1720" : "#E8F2FC",
    surface: darkMode ? "#16212D" : Colors.SURFACE,
    surfaceAlt: darkMode ? "#1B2633" : "#F7FBFF",
    text: darkMode ? "#E8F0F8" : Colors.DGREY,
    muted: darkMode ? "#BFD0E0" : Colors.MUTED,
    border: darkMode ? "#243241" : Colors.BORDER,
    accent: "#1E88E5",
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: theme.surface }, Shadow.sm]}>
          <Text style={[styles.title, { color: theme.text }]}>Sincronizacion</Text>
          <Text style={[styles.description, { color: theme.muted }]}>
            En modo SQL Local, la app descarga el catalogo al dispositivo y luego las busquedas se realizan sobre la base local.
          </Text>
          <Text style={[styles.descriptionNote, { color: theme.muted }]}>
            SQL directo requiere APK propia / development build. No funciona en Expo Go.
          </Text>

          <View style={[styles.infoBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
            <Ionicons name="server-outline" size={18} color={theme.accent} />
            <Text style={[styles.infoText, { color: theme.text }]}>
              Modo actual: {mode === "ONLINE" ? "SQL Online" : mode === "LOCAL" ? "SQL Local" : "API AlfaNet"}
            </Text>
          </View>

          <View style={[styles.infoBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
            <Ionicons name="time-outline" size={18} color={theme.accent} />
            <Text style={[styles.infoText, { color: theme.text }]}>
              Ultima sincronizacion: {formatDateTime(lastSyncAt)}
            </Text>
          </View>

          {mode === "LOCAL" ? (
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.accent }]}
              onPress={handleSync}
              disabled={syncing}
            >
              {syncing ? <ActivityIndicator color={Colors.WHITE} /> : <Ionicons name="cloud-upload-outline" size={20} color={Colors.WHITE} />}
              <Text style={styles.primaryButtonText}>{syncing ? "Sincronizando..." : "Sincronizar ahora"}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.accent }]}
              onPress={() => navigation.navigate("ConfigurationScreen")}
            >
              <Ionicons name="settings-outline" size={20} color={Colors.WHITE} />
              <Text style={styles.primaryButtonText}>Revisar configuracion</Text>
            </TouchableOpacity>
          )}

          {!!status ? <Text style={[styles.status, { color: theme.text }]}>{status}</Text> : null}
        </View>

        <TouchableOpacity
          style={[styles.secondaryButton, { backgroundColor: theme.surface }, Shadow.sm]}
          onPress={() => Alert.alert("AlfaScan", "La sincronizacion de productos quedo preparada para la siguiente etapa.")}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Limpiar y resincronizar</Text>
        </TouchableOpacity>
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
  description: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.body,
    marginBottom: 16,
  },
  descriptionNote: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: Fonts.body,
    marginBottom: 14,
  },
  infoBox: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.body,
  },
  primaryButton: {
    marginTop: 8,
    borderRadius: 16,
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primaryButtonText: {
    color: Colors.WHITE,
    fontFamily: Fonts.display,
    fontSize: 15,
  },
  status: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.body,
  },
  secondaryButton: {
    borderRadius: Radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  secondaryButtonText: {
    fontFamily: Fonts.display,
    fontSize: 14,
  },
});
