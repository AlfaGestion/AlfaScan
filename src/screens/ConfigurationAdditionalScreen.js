import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ConfigItem from "@components/ConfigItem";
import Configuration from "@db/Configuration";
import Colors from "@styles/Colors";
import { Fonts, Radii, Shadow } from "@styles/Theme";
import { useThemeConfig } from "@context/ThemeContext";
import {
  closeSql,
  connectSql,
  getSqlConnectorAvailabilityError,
  isSqlConnectorAvailable,
  parseSqlServerAddress,
} from "@services/sqlClient";

const FREQUENCY_OPTIONS = [
  { label: "Al iniciar la app", value: "ON_START" },
  { label: "Cada 1 hora", value: "EVERY_1_HOUR" },
  { label: "Cada 2 horas", value: "EVERY_2_HOURS" },
  { label: "Cada 3 horas", value: "EVERY_3_HOURS" },
  { label: "Manualmente", value: "MANUAL" },
];

const IMAGE_SIZE_OPTIONS = [
  { label: "Pequeño", value: "SMALL" },
  { label: "Mediano", value: "MEDIUM" },
  { label: "Grande", value: "LARGE" },
];

const defaultConfig = {
  SQL_INSTANCE: "",
  SQL_PORT: "",
  SQL_CODE_FIELD: "CodigoArticulo",
  SQL_BARCODE_FIELD: "CodigoBarra",
  SQL_DESCRIPTION_FIELD: "Descripcion",
  SQL_PRICE_FIELD: "Precio",
  SQL_STOCK_FIELD: "Stock",
  SQL_USE_STOCK_COLUMN: false,
  USE_PRODUCT_IMAGE: false,
  PRODUCT_IMAGE_BASE_PATH: "",
  PRODUCT_IMAGE_DEFAULT_EXTENSION: "jpg",
  PRODUCT_IMAGE_ALLOWED_EXTENSIONS: "jpg,jpeg,png",
  PRODUCT_IMAGE_HOME_SIZE: "MEDIUM",
  SQL_TIMEOUT: "15",
  SYNC_FREQUENCY: "MANUAL",
  SQL_TRUST_SERVER_CERTIFICATE: false,
  SQL_USE_SSL: false,
};

const loadConfigMap = (rows) =>
  rows.reduce((acc, item) => {
    acc[String(item.key ?? "").trim()] = item.value;
    return acc;
  }, {});

const SectionTitle = ({ children, color }) => (
  <Text style={[styles.sectionTitle, { color }]}>{children}</Text>
);

export default function ConfigurationAdditionalScreen({ navigation }) {
  const [config, setConfig] = useState(defaultConfig);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState("");
  const { darkMode } = useThemeConfig();
  const insets = useSafeAreaInsets();

  const theme = useMemo(
    () => ({
      background: darkMode ? "#0F1720" : "#E8F2FC",
      surface: darkMode ? "#16212D" : Colors.SURFACE,
      text: darkMode ? "#E8F0F8" : Colors.DGREY,
      muted: darkMode ? "#BFD0E0" : Colors.MUTED,
      accent: "#1E88E5",
      accentDark: "#0B5FA5",
    }),
    [darkMode],
  );

  const loadConfiguration = useCallback(async () => {
    await Configuration.createTable();
    const rows = await Configuration.query();
    const map = loadConfigMap(rows);
    const parsedServer = parseSqlServerAddress(map.SQL_SERVER ?? "");

    setConfig({
      SQL_INSTANCE: String(map.SQL_INSTANCE ?? parsedServer.instance ?? "").trim(),
      SQL_PORT: String(
        parsedServer.port !== null ? parsedServer.port : map.SQL_PORT ?? "",
      ).trim(),
      SQL_CODE_FIELD: String(map.SQL_CODE_FIELD ?? "CodigoArticulo").trim(),
      SQL_BARCODE_FIELD: String(map.SQL_BARCODE_FIELD ?? "CodigoBarra").trim(),
      SQL_DESCRIPTION_FIELD: String(
        map.SQL_DESCRIPTION_FIELD ?? "Descripcion",
      ).trim(),
      SQL_PRICE_FIELD: String(map.SQL_PRICE_FIELD ?? "Precio").trim(),
      SQL_STOCK_FIELD: String(map.SQL_STOCK_FIELD ?? "Stock").trim(),
      SQL_USE_STOCK_COLUMN: Configuration.isTruthyConfigValue(
        map.SQL_USE_STOCK_COLUMN ?? map.SQL_USE_STOCK,
      ),
      USE_PRODUCT_IMAGE: Configuration.isTruthyConfigValue(
        map.USE_PRODUCT_IMAGE ?? map.CARGA_IMAGENES,
      ),
      PRODUCT_IMAGE_BASE_PATH: String(
        map.PRODUCT_IMAGE_BASE_PATH ?? map.PRODUCT_IMAGE_PATH ?? "",
      ).trim(),
      PRODUCT_IMAGE_DEFAULT_EXTENSION: String(
        map.PRODUCT_IMAGE_DEFAULT_EXTENSION ?? "jpg",
      ).trim(),
      PRODUCT_IMAGE_ALLOWED_EXTENSIONS: String(
        map.PRODUCT_IMAGE_ALLOWED_EXTENSIONS ?? "jpg,jpeg,png",
      ).trim(),
      PRODUCT_IMAGE_HOME_SIZE: String(
        map.PRODUCT_IMAGE_HOME_SIZE ?? "MEDIUM",
      ).trim().toUpperCase(),
      SQL_TIMEOUT: String(map.SQL_TIMEOUT ?? "15").trim(),
      SYNC_FREQUENCY: String(map.SYNC_FREQUENCY ?? "MANUAL").trim(),
      SQL_TRUST_SERVER_CERTIFICATE: Configuration.isTruthyConfigValue(
        map.SQL_TRUST_SERVER_CERTIFICATE,
      ),
      SQL_USE_SSL: Configuration.isTruthyConfigValue(map.SQL_USE_SSL),
    });
  }, []);

  useEffect(() => {
    loadConfiguration();
  }, [loadConfiguration]);

  useFocusEffect(
    useCallback(() => {
      loadConfiguration();
    }, [loadConfiguration]),
  );

  const handleChange = (field, value) => {
    setConfig((current) => ({ ...current, [field]: value }));
  };

  const save = async () => {
    setSaving(true);
    setStatus("");
    try {
      await Configuration.createTable();
      const payload = {
        ...config,
        SQL_TRUST_SERVER_CERTIFICATE: config.SQL_TRUST_SERVER_CERTIFICATE
          ? "1"
          : "0",
        SQL_USE_SSL: config.SQL_USE_SSL ? "1" : "0",
        SQL_USE_STOCK_COLUMN: config.SQL_USE_STOCK_COLUMN ? "1" : "0",
        SQL_USE_STOCK: config.SQL_USE_STOCK_COLUMN ? "1" : "0",
        USE_PRODUCT_IMAGE: config.USE_PRODUCT_IMAGE ? "1" : "0",
        CARGA_IMAGENES: config.USE_PRODUCT_IMAGE ? "1" : "0",
        PRODUCT_IMAGE_BASE_PATH: config.PRODUCT_IMAGE_BASE_PATH,
        PRODUCT_IMAGE_PATH: config.PRODUCT_IMAGE_BASE_PATH,
        PRODUCT_IMAGE_DEFAULT_EXTENSION: config.PRODUCT_IMAGE_DEFAULT_EXTENSION,
        PRODUCT_IMAGE_ALLOWED_EXTENSIONS: config.PRODUCT_IMAGE_ALLOWED_EXTENSIONS,
        PRODUCT_IMAGE_HOME_SIZE: config.PRODUCT_IMAGE_HOME_SIZE,
      };
      for (const [key, value] of Object.entries(payload)) {
        await Configuration.setConfigValue(key, String(value ?? "").trim());
      }
      await loadConfiguration();
      setStatus("Configuración adicional guardada correctamente.");
    } catch (e) {
      setStatus(e?.message || "No se pudo guardar la configuración adicional.");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (testing) {
      return;
    }

    if (!isSqlConnectorAvailable()) {
      setStatus(getSqlConnectorAvailabilityError());
      return;
    }

    setTesting(true);
    setStatus("");
    try {
      await Configuration.createTable();
      const map = loadConfigMap(await Configuration.query());
      const server = String(map.SQL_SERVER ?? "").trim();
      const database = String(map.SQL_DATABASE ?? "").trim();
      const user = String(map.SQL_USER ?? "").trim();
      const password = String(map.SQL_PASSWORD ?? "").trim();

      if (!server)
        throw new Error(
          "Complete el servidor SQL en la configuración principal.",
        );
      if (!database)
        throw new Error(
          "Complete la base de datos SQL en la configuración principal.",
        );
      if (!user)
        throw new Error(
          "Complete el usuario SQL en la configuración principal.",
        );
      if (!password)
        throw new Error(
          "Complete la contraseña SQL en la configuración principal.",
        );

      await connectSql({
        server,
        instance: config.SQL_INSTANCE,
        port: config.SQL_PORT,
        username: user,
        password,
        database,
        timeout: Number(config.SQL_TIMEOUT || 15),
        trustServerCertificate: config.SQL_TRUST_SERVER_CERTIFICATE
          ? true
          : undefined,
        encrypt: config.SQL_USE_SSL ? true : undefined,
      });
      await closeSql();
      setStatus("Conexión SQL verificada.");
    } catch (e) {
      setStatus(e?.message || getSqlConnectorAvailabilityError());
      await closeSql();
    } finally {
      setTesting(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 28 + insets.bottom },
        ]}
      >
        <View
          style={[styles.card, { backgroundColor: theme.surface }, Shadow.sm]}
        >
          <Text style={[styles.title, { color: theme.text }]}>
            Configuración adicional
          </Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>
            Acá quedan los parámetros avanzados y los nombres de campos de la
            vista o tabla.
          </Text>

          <SectionTitle color={theme.text}>Sincronización</SectionTitle>
          <ConfigItem
            type="select"
            title="Frecuencia de sincronización"
            field="SYNC_FREQUENCY"
            value={config.SYNC_FREQUENCY}
            options={FREQUENCY_OPTIONS}
            handleChange={handleChange}
            darkMode={darkMode}
          />

          <SectionTitle color={theme.text}>Servidor y conexión</SectionTitle>
          <ConfigItem
            type="input"
            title="Instancia SQL"
            field="SQL_INSTANCE"
            placeholder="SQLEXPRESS"
            value={config.SQL_INSTANCE}
            handleChange={handleChange}
            darkMode={darkMode}
          />
          <ConfigItem
            type="input"
            title="Puerto SQL"
            field="SQL_PORT"
            placeholder="1433"
            value={config.SQL_PORT}
            keyboardType="numeric"
            handleChange={handleChange}
            darkMode={darkMode}
          />
          <ConfigItem
            type="input"
            title="Campo código artículo"
            field="SQL_CODE_FIELD"
            placeholder="CodigoArticulo"
            value={config.SQL_CODE_FIELD}
            handleChange={handleChange}
            darkMode={darkMode}
          />
          <ConfigItem
            type="input"
            title="Campo código de barras"
            field="SQL_BARCODE_FIELD"
            placeholder="CodigoBarra"
            value={config.SQL_BARCODE_FIELD}
            handleChange={handleChange}
            darkMode={darkMode}
          />
          <ConfigItem
            type="input"
            title="Campo descripción"
            field="SQL_DESCRIPTION_FIELD"
            placeholder="Descripcion"
            value={config.SQL_DESCRIPTION_FIELD}
            handleChange={handleChange}
            darkMode={darkMode}
          />
          <ConfigItem
            type="input"
            title="Campo precio"
            field="SQL_PRICE_FIELD"
            placeholder="Precio"
            value={config.SQL_PRICE_FIELD}
            handleChange={handleChange}
            darkMode={darkMode}
          />
          <ConfigItem
            type="input"
            title="Campo stock"
            field="SQL_STOCK_FIELD"
            placeholder="Stock"
            value={config.SQL_STOCK_FIELD}
            handleChange={handleChange}
            darkMode={darkMode}
          />
          <ConfigItem
            type="checkbox"
            title="Usar columna stock"
            field="SQL_USE_STOCK_COLUMN"
            value={config.SQL_USE_STOCK_COLUMN}
            handleChange={handleChange}
            darkMode={darkMode}
          />
          <Text style={[styles.helperText, { color: theme.muted }]}>
            Si está desactivado, la app no consultará ni mostrará stock.
          </Text>
          <ConfigItem
            type="input"
            title="Timeout SQL"
            field="SQL_TIMEOUT"
            placeholder="15"
            value={config.SQL_TIMEOUT}
            keyboardType="numeric"
            handleChange={handleChange}
            darkMode={darkMode}
          />
          <ConfigItem
            type="checkbox"
            title="Usar SSL"
            field="SQL_USE_SSL"
            value={config.SQL_USE_SSL}
            handleChange={handleChange}
            darkMode={darkMode}
          />
          <ConfigItem
            type="checkbox"
            title="Trust server certificate"
            field="SQL_TRUST_SERVER_CERTIFICATE"
            value={config.SQL_TRUST_SERVER_CERTIFICATE}
            handleChange={handleChange}
            darkMode={darkMode}
          />
        </View>

        <View
          style={[styles.card, { backgroundColor: theme.surface }, Shadow.sm]}
        >
          <View style={styles.inlineActions}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.accent }]}
              onPress={testConnection}
              disabled={testing}
            >
              {testing ? (
                <ActivityIndicator color={Colors.WHITE} />
              ) : (
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color={Colors.WHITE}
                />
              )}
              <Text style={styles.actionButtonText}>Probar conexión</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.actionButton,
                { backgroundColor: theme.accentDark },
              ]}
              onPress={save}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={Colors.WHITE} />
              ) : (
                <Ionicons name="save-outline" size={18} color={Colors.WHITE} />
              )}
              <Text style={styles.actionButtonText}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View>

        {!!status ? (
          <View
            style={[styles.card, { backgroundColor: theme.surface }, Shadow.sm]}
          >
            <Text style={styles.statusText}>{status}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 28 },
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
  sectionTitle: {
    fontSize: 18,
    fontFamily: Fonts.display,
    marginBottom: 10,
  },
  helperText: {
    marginTop: 2,
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: Fonts.body,
  },
  inlineActions: {
    marginTop: 8,
    gap: 10,
  },
  actionButton: {
    minHeight: 48,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  actionButtonText: {
    color: Colors.WHITE,
    fontFamily: Fonts.display,
    fontSize: 14,
  },
  statusText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.body,
  },
});
