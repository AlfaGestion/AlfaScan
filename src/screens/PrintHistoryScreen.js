import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Alert, FlatList, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";

import Colors from "@styles/Colors";
import { Fonts, Radii, Shadow } from "@styles/Theme";
import { useThemeConfig } from "@context/ThemeContext";
import { clearPrintHistory, loadPrintHistory } from "@services/printHistory";

const formatDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value ?? "");
  }

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

export default function PrintHistoryScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const { darkMode } = useThemeConfig();

  const loadItems = useCallback(async () => {
    setItems(await loadPrintHistory());
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [loadItems])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerStyle: { backgroundColor: darkMode ? "#16212D" : "#DDEAF8" },
      headerTintColor: darkMode ? "#E8F0F8" : "#1A395A",
      headerTitleStyle: { color: darkMode ? "#E8F0F8" : "#1A395A", fontWeight: "700" },
    });
  }, [navigation, darkMode]);

  const theme = {
    background: darkMode ? "#0F1720" : "#E8F2FC",
    surface: darkMode ? "#16212D" : Colors.SURFACE,
    text: darkMode ? "#E8F0F8" : Colors.DGREY,
    muted: darkMode ? "#BFD0E0" : Colors.MUTED,
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.text }]}>Historial de impresiones</Text>
        <TouchableOpacity
          onPress={async () => {
            await clearPrintHistory();
            setItems([]);
            Alert.alert("AlfaScan", "El historial fue limpiado.");
          }}
          style={[styles.clearButton, Shadow.sm]}
        >
          <Ionicons name="trash-outline" size={18} color={Colors.WHITE} />
          <Text style={styles.clearButtonText}>Limpiar</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={items.length === 0 ? styles.emptyContent : styles.listContent}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: theme.surface }, Shadow.sm]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{item.formatLabel}</Text>
            <Text style={[styles.cardLine, { color: theme.muted }]}>{item.article?.descripcion || "Articulo"}</Text>
            <Text style={[styles.cardLine, { color: theme.text }]}>
              {item.article?.codigoBarra || "-"} | {item.article?.codigoInterno || "-"}
            </Text>
            <Text style={[styles.cardDate, { color: theme.muted }]}>{formatDateTime(item.createdAt)}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={[styles.emptyState, { backgroundColor: theme.surface }, Shadow.sm]}>
            <Ionicons name="receipt-outline" size={32} color={theme.muted} />
            <Text style={[styles.emptyText, { color: theme.muted }]}>No hay impresiones registradas todavía.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontFamily: Fonts.display,
  },
  clearButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#D64545",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  clearButtonText: {
    color: Colors.WHITE,
    fontFamily: Fonts.display,
    fontSize: 13,
  },
  listContent: {
    paddingBottom: 24,
    gap: 10,
  },
  emptyContent: {
    flexGrow: 1,
  },
  card: {
    borderRadius: Radii.lg,
    padding: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: Fonts.display,
    marginBottom: 4,
  },
  cardLine: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.body,
  },
  cardDate: {
    marginTop: 8,
    fontSize: 12,
    fontFamily: Fonts.body,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radii.xl,
    padding: 24,
  },
  emptyText: {
    marginTop: 10,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.body,
  },
});
