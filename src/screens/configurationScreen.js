import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ConfigItem from "@components/ConfigItem";
import Configuration from "@db/Configuration";
import Colors from "@styles/Colors";
import { Fonts, Radii, Shadow } from "@styles/Theme";
import { useThemeConfig } from "@context/ThemeContext";
import { getCompanyNameFromSqlConfig, syncCatalogToLocal } from "@services/catalogService";
import {
  closeSql,
  connectSql,
  getSqlConnectorAvailabilityError,
  isSqlConnectorAvailable,
  parseSqlServerAddress,
} from "@services/sqlClient";

const DEFAULT_API_URI = "http://alfanetac.ddns.net:7705/api/v2/";

const MODE_OPTIONS = [
  { label: "SQL Local", value: "LOCAL" },
  { label: "SQL Online", value: "ONLINE" },
  { label: "API AlfaNet", value: "API" },
];

const FREQUENCY_OPTIONS = [
  { label: "Al iniciar la app", value: "ON_START" },
  { label: "Cada 1 hora", value: "EVERY_1_HOUR" },
  { label: "Cada 2 horas", value: "EVERY_2_HOURS" },
  { label: "Cada 3 horas", value: "EVERY_3_HOURS" },
  { label: "Manualmente", value: "MANUAL" },
];

const THEME_OPTIONS = [
  { label: "Claro", value: false, icon: "sunny-outline" },
  { label: "Oscuro", value: true, icon: "moon-outline" },
];

const defaultConfig = {
  CONNECTION_TYPE: "LOCAL",
  COMPANY_NAME: "",
  API_URI: "",
  API_ACCOUNT_CODE: "",
  API_USER: "",
  API_PASSWORD: "",
  API_BASE_ID: "",
  API_TIMEOUT: "15",
  API_SSL: false,
  SYNC_FREQUENCY: "MANUAL",
  SQL_SERVER: "",
  SQL_DATABASE: "",
  SQL_USER: "",
  SQL_PASSWORD: "",
  SQL_ARTICLES_TABLE: "Productos",
  SQL_INSTANCE: "",
  SQL_PORT: "",
  SQL_TIMEOUT: "15",
  SQL_TRUST_SERVER_CERTIFICATE: false,
  SQL_USE_SSL: false,
  SQL_MODE: "LOCAL",
  TEMA_OSCURO: false,
};

const loadConfigMap = (rows) =>
  (Array.isArray(rows) ? rows : []).reduce((acc, item) => {
    acc[String(item.key ?? "").trim()] = item.value;
    return acc;
  }, {});

const normalizeMode = (value) => {
  const mode = String(value ?? "")
    .trim()
    .toUpperCase();
  if (mode === "API" || mode === "LOCAL" || mode === "ONLINE") return mode;
  return "LOCAL";
};

const normalizeFrequency = (value) => {
  const freq = String(value ?? "")
    .trim()
    .toUpperCase();
  return FREQUENCY_OPTIONS.some((item) => item.value === freq)
    ? freq
    : "MANUAL";
};

const SectionTitle = ({ children, color }) => (
  <Text style={[styles.sectionTitle, { color }]}>{children}</Text>
);

const ModeChip = ({ label, active, onPress, darkMode }) => (
  <TouchableOpacity
    onPress={onPress}
    style={[
      styles.modeChip,
      {
        backgroundColor: active
          ? "#1E88E5"
          : darkMode
            ? "#152332"
            : Colors.SURFACE,
        borderColor: active ? "#1E88E5" : darkMode ? "#243241" : Colors.BORDER,
      },
    ]}
  >
    <Text
      style={[
        styles.modeChipText,
        { color: active ? Colors.WHITE : darkMode ? "#E8F0F8" : Colors.DGREY },
      ]}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

const ThemeSwitcher = ({ value, onChange, darkMode }) => (
  <View style={[styles.themeSelector, darkMode && styles.themeSelectorDark]}>
    {THEME_OPTIONS.map((item) => {
      const active = value === item.value;
      return (
        <TouchableOpacity
          key={item.label}
          onPress={() => onChange(item.value)}
          style={[
            styles.themeOption,
            active &&
              (darkMode
                ? styles.themeOptionActiveDark
                : styles.themeOptionActiveLight),
          ]}
        >
          <Ionicons
            name={item.icon}
            size={18}
            color={active ? (darkMode ? "#8FC3FF" : "#1A395A") : "#7A8A9A"}
          />
          <Text
            style={[
              styles.themeOptionText,
              {
                color: active ? (darkMode ? "#E8F0F8" : "#1A395A") : "#7A8A9A",
              },
            ]}
          >
            {item.label}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const PasswordField = ({ title, value, onChange, placeholder, darkMode }) => {
  const [secure, setSecure] = useState(true);

  return (
    <View>
      <Text style={[styles.fieldLabel, darkMode && styles.fieldLabelDark]}>
        {title}
      </Text>
      <View style={[styles.passwordWrap, darkMode && styles.passwordWrapDark]}>
        <TextInput
          style={[styles.passwordInput, darkMode && styles.passwordInputDark]}
          placeholder={placeholder}
          placeholderTextColor={darkMode ? "#9CB2C8" : Colors.MUTED}
          value={value}
          onChangeText={onChange}
          secureTextEntry={secure}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          onPress={() => setSecure((current) => !current)}
          style={styles.passwordIconButton}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={
            secure ? "Mostrar contraseña" : "Ocultar contraseña"
          }
        >
          <Ionicons
            name={secure ? "eye-outline" : "eye-off-outline"}
            size={20}
            color={darkMode ? "#BFD0E0" : Colors.MUTED}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const ConnectionStatusCard = ({ result, theme, darkMode }) => {
  if (!result) return null;

  const config = {
    loading: {
      icon: "sync-outline",
      iconColor: "#1E88E5",
      iconBg: darkMode ? "#152332" : "#EAF4FF",
      border: darkMode ? "#243241" : "#D7E6F5",
    },
    success: {
      icon: "checkmark-circle",
      iconColor: "#1F8B4C",
      iconBg: darkMode ? "#163123" : "#E4F6EA",
      border: darkMode ? "#254732" : "#CDEAD8",
    },
    unavailable: {
      icon: "information-circle",
      iconColor: "#5A728A",
      iconBg: darkMode ? "#1B2633" : "#E8EEF5",
      border: darkMode ? "#304152" : "#CBD5E1",
    },
    error: {
      icon: "alert-circle",
      iconColor: "#E5484D",
      iconBg: darkMode ? "#3A1D22" : "#FDEBEC",
      border: darkMode ? "#5A2A31" : "#F5C8CD",
    },
  }[result.status];

  return (
    <View
      style={[
        styles.connectionCard,
        { backgroundColor: theme.surface, borderColor: config.border },
        Shadow.sm,
      ]}
    >
      <View
        style={[styles.connectionIconWrap, { backgroundColor: config.iconBg }]}
      >
        {result.status === "loading" ? (
          <ActivityIndicator color={config.iconColor} />
        ) : (
          <Ionicons name={config.icon} size={24} color={config.iconColor} />
        )}
      </View>
      <View style={styles.connectionTextWrap}>
        <Text style={[styles.connectionTitle, { color: theme.text }]}>
          {result.title}
        </Text>
        <Text style={[styles.connectionSubtitle, { color: theme.muted }]}>
          {result.subtitle}
        </Text>
        {result.detail ? (
          <Text
            style={[styles.connectionDetail, { color: theme.text }]}
            numberOfLines={2}
          >
            {result.detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

export default function ConfigurationScreen({ navigation }) {
  const [config, setConfig] = useState(defaultConfig);
  const [activeMode, setActiveMode] = useState("API");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState("");
  const [connectionResult, setConnectionResult] = useState(null);
  const { darkMode, refreshTheme } = useThemeConfig();
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
      success: "#1F8B4C",
    }),
    [darkMode],
  );

  const loadConfiguration = useCallback(async () => {
    await Configuration.createTable();
    const rows = await Configuration.query();
    const map = loadConfigMap(rows);
    const companyName = String(map.COMPANY_NAME ?? map.SQL_COMPANY_NAME ?? "").trim();

    const nextConfig = {
      ...defaultConfig,
      COMPANY_NAME: companyName,
      CONNECTION_TYPE: normalizeMode(map.CONNECTION_TYPE || map.SQL_MODE),
      API_URI: String(map.API_URI ?? "").trim(),
      API_ACCOUNT_CODE: String(
        map.API_ACCOUNT_CODE ?? map.ALFA_ACCOUNT ?? "",
      ).trim(),
      API_USER: String(map.API_USER ?? map.USERNAME_SYNC ?? "").trim(),
      API_PASSWORD: String(map.API_PASSWORD ?? map.PASSWORD_SYNC ?? "").trim(),
      API_BASE_ID: String(map.API_BASE_ID ?? map.ALFA_DATABASE_ID ?? "").trim(),
      API_TIMEOUT: String(map.API_TIMEOUT ?? map.SQL_TIMEOUT ?? "15").trim(),
      API_SSL: Configuration.isTruthyConfigValue(map.API_SSL),
      SYNC_FREQUENCY: normalizeFrequency(map.SYNC_FREQUENCY),
      SQL_SERVER: String(map.SQL_SERVER ?? "").trim(),
      SQL_DATABASE: String(map.SQL_DATABASE ?? "").trim(),
      SQL_USER: String(map.SQL_USER ?? "").trim(),
      SQL_PASSWORD: String(map.SQL_PASSWORD ?? "").trim(),
      SQL_ARTICLES_TABLE: String(
        map.SQL_ARTICLES_TABLE ?? map.SQL_TABLE_VIEW ?? "Productos",
      ).trim(),
      SQL_INSTANCE: String(map.SQL_INSTANCE ?? "").trim(),
      SQL_PORT: String(map.SQL_PORT ?? "").trim(),
      SQL_TIMEOUT: String(map.SQL_TIMEOUT ?? "15").trim(),
      SQL_TRUST_SERVER_CERTIFICATE: Configuration.isTruthyConfigValue(
        map.SQL_TRUST_SERVER_CERTIFICATE,
      ),
      SQL_USE_SSL: Configuration.isTruthyConfigValue(map.SQL_USE_SSL),
      SQL_MODE: normalizeMode(map.SQL_MODE || "LOCAL"),
      TEMA_OSCURO: Configuration.isTruthyConfigValue(map.TEMA_OSCURO),
    };

    const parsedServer = parseSqlServerAddress(nextConfig.SQL_SERVER);
    if (!nextConfig.SQL_PORT && parsedServer.port !== null) {
      nextConfig.SQL_PORT = String(parsedServer.port);
    }
    if (!nextConfig.SQL_INSTANCE && parsedServer.instance) {
      nextConfig.SQL_INSTANCE = parsedServer.instance;
    }

    if (nextConfig.CONNECTION_TYPE === "API" && !nextConfig.API_URI) {
      nextConfig.API_URI = DEFAULT_API_URI;
    }

    if (!nextConfig.COMPANY_NAME && nextConfig.CONNECTION_TYPE === "ONLINE") {
      const sqlCompanyName = await getCompanyNameFromSqlConfig().catch(() => "");
      if (sqlCompanyName) {
        nextConfig.COMPANY_NAME = sqlCompanyName;
      }
    }

    setActiveMode(nextConfig.CONNECTION_TYPE);
    setConfig(nextConfig);
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
    if (
      [
        "API_URI",
        "API_ACCOUNT_CODE",
        "API_USER",
        "API_PASSWORD",
        "API_BASE_ID",
        "SQL_SERVER",
        "SQL_DATABASE",
        "SQL_USER",
        "SQL_PASSWORD",
        "SQL_ARTICLES_TABLE",
      ].includes(field)
    ) {
      setConnectionResult(null);
    }
    setConfig((current) => ({ ...current, [field]: value }));
  };

  const handleModeChange = (mode) => {
    setActiveMode(mode);
    setConnectionResult(null);
    setConfig((current) => {
      const next = { ...current, CONNECTION_TYPE: mode };
      if (mode === "API" && !String(next.API_URI).trim()) {
        next.API_URI = DEFAULT_API_URI;
      }
      if (mode === "ONLINE" || mode === "LOCAL") {
        next.SQL_MODE = mode;
      }
      return next;
    });
  };

  const saveConfiguration = async () => {
    setSaving(true);
    setStatus("");

    try {
      const parsedServer = parseSqlServerAddress(config.SQL_SERVER);

      if (activeMode === "API") {
        if (!String(config.API_URI).trim())
          throw new Error("Complete la ruta web service.");
        if (!String(config.API_ACCOUNT_CODE).trim())
          throw new Error("Complete el código de cuenta AlfaNet.");
        if (!String(config.API_USER).trim())
          throw new Error("Complete el usuario.");
        if (!String(config.API_PASSWORD).trim())
          throw new Error("Complete la contraseña.");
        if (!String(config.API_BASE_ID).trim())
          throw new Error("Complete el ID base.");
      }

      if (activeMode === "LOCAL" || activeMode === "ONLINE") {
        if (!String(config.SQL_SERVER).trim())
          throw new Error("Complete el servidor SQL.");
        if (!String(config.SQL_DATABASE).trim())
          throw new Error("Complete la base de datos SQL.");
        if (!String(config.SQL_USER).trim())
          throw new Error("Complete el usuario SQL.");
        if (!String(config.SQL_PASSWORD).trim())
          throw new Error("Complete la contraseña SQL.");
        if (!String(config.SQL_ARTICLES_TABLE).trim())
          throw new Error("Complete la tabla o vista de artículos.");
      }

      const payload = [
        ["CONNECTION_TYPE", activeMode],
        ["COMPANY_NAME", config.COMPANY_NAME],
        [
          "SQL_MODE",
          activeMode === "ONLINE"
            ? "ONLINE"
            : activeMode === "LOCAL"
              ? "LOCAL"
              : config.SQL_MODE,
        ],
        ["API_URI", config.API_URI],
        ["ALFA_ACCOUNT", config.API_ACCOUNT_CODE],
        ["API_ACCOUNT_CODE", config.API_ACCOUNT_CODE],
        ["USERNAME_SYNC", config.API_USER],
        ["API_USER", config.API_USER],
        ["PASSWORD_SYNC", config.API_PASSWORD],
        ["API_PASSWORD", config.API_PASSWORD],
        ["ALFA_DATABASE_ID", config.API_BASE_ID],
        ["API_BASE_ID", config.API_BASE_ID],
        ["API_TIMEOUT", config.API_TIMEOUT],
        ["API_SSL", config.API_SSL ? "1" : "0"],
        [
          "SQL_SERVER",
          config.SQL_SERVER,
        ],
        [
          "SQL_PORT",
          parsedServer.port !== null
            ? String(parsedServer.port)
            : config.SQL_PORT,
        ],
        ["SQL_TIMEOUT", config.SQL_TIMEOUT],
        [
          "SQL_INSTANCE",
          parsedServer.instance || config.SQL_INSTANCE,
        ],
        ["SQL_DATABASE", config.SQL_DATABASE],
        ["SQL_USER", config.SQL_USER],
        ["SQL_PASSWORD", config.SQL_PASSWORD],
        ["SQL_ARTICLES_TABLE", config.SQL_ARTICLES_TABLE],
        ["SQL_TABLE_VIEW", config.SQL_ARTICLES_TABLE],
        ["TEMA_OSCURO", config.TEMA_OSCURO ? "1" : "0"],
      ];

      for (const [key, value] of payload) {
        await Configuration.setConfigValue(key, String(value ?? "").trim());
      }

      await loadConfiguration();
      setStatus("Configuración guardada correctamente.");
      await refreshTheme();
    } catch (e) {
      setStatus(e?.message || "No se pudo guardar la configuración.");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (testing) {
      return;
    }

    if (activeMode === "API") {
      if (!String(config.API_URI).trim()) {
        setConnectionResult({
          status: "error",
          title: "No se pudo conectar",
          subtitle: "Completá la ruta web service antes de probar.",
        });
        return;
      }

      setTesting(true);
      setConnectionResult({
        status: "loading",
        title: "Conectando...",
        subtitle: "Estamos verificando la conexión con el servidor SQL.",
      });

      try {
        const response = await fetch(String(config.API_URI).trim(), {
          method: "GET",
        });
        if (!response.ok && response.status !== 0) {
          throw new Error("No fue posible contactar la ruta web service.");
        }
        setConnectionResult({
          status: "success",
          title: "Conexión exitosa",
          subtitle: "La app pudo conectarse correctamente al servidor.",
        });
      } catch (e) {
        const rawMessage = String(
          e?.message || "No se pudo probar la conexión.",
        ).trim();
        const detail =
          rawMessage.length > 140
            ? `${rawMessage.slice(0, 137).trimEnd()}...`
            : rawMessage;
        setConnectionResult({
          status: "error",
          title: "No se pudo conectar",
          subtitle: "Revisá los datos y volvé a intentar.",
          detail,
        });
      } finally {
        setTesting(false);
      }
      return;
    }

    if (
      !String(config.SQL_SERVER).trim() ||
      !String(config.SQL_DATABASE).trim() ||
      !String(config.SQL_USER).trim() ||
      !String(config.SQL_PASSWORD).trim() ||
      !String(config.SQL_ARTICLES_TABLE).trim()
    ) {
      setConnectionResult({
        status: "error",
        title: "No se pudo conectar",
        subtitle:
          "Completá servidor, base, usuario, contraseña y tabla/vista antes de probar.",
      });
      return;
    }

    if (!isSqlConnectorAvailable()) {
      setConnectionResult({
        status: "unavailable",
        title: "Conector SQL no disponible",
        subtitle: getSqlConnectorAvailabilityError(),
      });
      return;
    }

    setTesting(true);
    setConnectionResult({
      status: "loading",
      title: "Conectando...",
      subtitle: "Estamos verificando la conexión con el servidor SQL.",
    });

    try {
      await connectSql({
        server: config.SQL_SERVER,
        instance: config.SQL_INSTANCE,
        port: config.SQL_PORT,
        username: String(config.SQL_USER).trim(),
        password: String(config.SQL_PASSWORD),
        database: String(config.SQL_DATABASE).trim(),
        timeout: Number(config.SQL_TIMEOUT || 15),
        trustServerCertificate: config.SQL_TRUST_SERVER_CERTIFICATE
          ? true
          : undefined,
        encrypt: config.SQL_USE_SSL ? true : undefined,
      });
      await closeSql();
      setConnectionResult({
        status: "success",
        title: "Conexión exitosa",
        subtitle: "La app pudo conectarse correctamente al servidor.",
      });
    } catch (e) {
      const rawMessage = String(
        e?.message || getSqlConnectorAvailabilityError(),
      ).trim();
      if (rawMessage === getSqlConnectorAvailabilityError()) {
        setConnectionResult({
          status: "unavailable",
          title: "Conector SQL no disponible",
          subtitle: rawMessage,
        });
        return;
      }
      const detail =
        rawMessage.length > 140
          ? `${rawMessage.slice(0, 137).trimEnd()}...`
          : rawMessage;
      setConnectionResult({
        status: "error",
        title: "No se pudo conectar",
        subtitle: "Revisá los datos y volvé a intentar.",
        detail,
      });
      await closeSql();
    } finally {
      setTesting(false);
    }
  };

  const syncNow = async () => {
    if (activeMode !== "LOCAL") {
      Alert.alert(
        "AlfaScan",
        "La sincronización manual aplica solo para SQL Local.",
      );
      return;
    }

    setSyncing(true);
    setStatus("");
    try {
      const result = await syncCatalogToLocal({
        onProgress: ({ inserted, page }) => {
          setStatus(
            `Sincronizando catálogo... ${inserted} registros importados (lote ${page}).`,
          );
        },
      });
      const now = new Date().toISOString();
      await Configuration.setConfigValue("LAST_SYNC_AT", now);
      setStatus(
        `Sincronización completada. Registros importados: ${result.inserted}.`,
      );
    } catch (e) {
      setStatus(e?.message || "No se pudo sincronizar el catálogo.");
    } finally {
      setSyncing(false);
    }
  };

  const testButtonLabel = testing ? "Probando..." : "Probar conexión";

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
            Configuración AlfaScan
          </Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>
            Defina el modo de conexión principal y los datos esenciales de
            acceso.
          </Text>

          <ConfigItem
            type="input"
            title="Nombre de empresa"
            field="COMPANY_NAME"
            placeholder="Nano Distribuciones"
            value={config.COMPANY_NAME}
            handleChange={handleChange}
            darkMode={darkMode}
            helperText="Se usarÃ¡ como encabezado de impresiÃ³n si estÃ¡ cargado."
          />

          <View style={styles.modeRow}>
            {MODE_OPTIONS.map((item) => (
              <ModeChip
                key={item.value}
                label={item.label}
                active={activeMode === item.value}
                onPress={() => handleModeChange(item.value)}
                darkMode={darkMode}
              />
            ))}
          </View>

          {activeMode === "API" ? (
            <>
              <SectionTitle color={theme.text}>API AlfaNet</SectionTitle>
              <Text style={[styles.sectionHint, { color: theme.muted }]}>
                Alternativa disponible, pero no es el camino principal para
                precios ni catalogo.
              </Text>
              <ConfigItem
                type="input"
                title="Ruta web service"
                field="API_URI"
                placeholder="https://..."
                value={config.API_URI}
                handleChange={handleChange}
                darkMode={darkMode}
              />
              <ConfigItem
                type="input"
                title="Código cuenta AlfaNet"
                field="API_ACCOUNT_CODE"
                placeholder="112010001"
                value={config.API_ACCOUNT_CODE}
                handleChange={handleChange}
                darkMode={darkMode}
              />
              <ConfigItem
                type="input"
                title="Usuario"
                field="API_USER"
                placeholder="usuario"
                value={config.API_USER}
                handleChange={handleChange}
                darkMode={darkMode}
              />
              <PasswordField
                title="Password"
                placeholder="********"
                value={config.API_PASSWORD}
                onChange={(value) => handleChange("API_PASSWORD", value)}
                darkMode={darkMode}
              />
              <ConfigItem
                type="input"
                title="ID Base"
                field="API_BASE_ID"
                placeholder="3239"
                value={config.API_BASE_ID}
                handleChange={handleChange}
                darkMode={darkMode}
              />
              <ConfigItem
                type="input"
                title="Timeout"
                field="API_TIMEOUT"
                placeholder="15"
                value={config.API_TIMEOUT}
                keyboardType="numeric"
                handleChange={handleChange}
                darkMode={darkMode}
              />
              <ConfigItem
                type="checkbox"
                title="Usar SSL"
                field="API_SSL"
                value={config.API_SSL}
                handleChange={handleChange}
                darkMode={darkMode}
              />
            </>
          ) : (
            <>
              <SectionTitle color={theme.text}>
                {activeMode === "LOCAL" ? "SQL Local" : "SQL Online"}
              </SectionTitle>
              <Text style={[styles.sectionHint, { color: theme.muted }]}>
                SQL directo requiere APK propia / development build. No
                funciona en Expo Go.
              </Text>
              <ConfigItem
                type="input"
                title="Servidor"
                field="SQL_SERVER"
                placeholder="SERVIDOR, IP o SERVIDOR\\INSTANCIA"
                value={config.SQL_SERVER}
                handleChange={handleChange}
                darkMode={darkMode}
                helperText="Formatos permitidos: IP, SERVIDOR, IP,PUERTO, SERVIDOR,PUERTO, IP\\INSTANCIA. Recomendado: IP,PUERTO."
              />
              <ConfigItem
                type="input"
                title="Base"
                field="SQL_DATABASE"
                placeholder="MiBase"
                value={config.SQL_DATABASE}
                handleChange={handleChange}
                darkMode={darkMode}
              />
              <ConfigItem
                type="input"
                title="Usuario"
                field="SQL_USER"
                placeholder="sa"
                value={config.SQL_USER}
                handleChange={handleChange}
                darkMode={darkMode}
              />
              <PasswordField
                title="Contraseña"
                placeholder="********"
                value={config.SQL_PASSWORD}
                onChange={(value) => handleChange("SQL_PASSWORD", value)}
                darkMode={darkMode}
              />
              <ConfigItem
                type="input"
                title="Tabla / Vista de artículos"
                field="SQL_ARTICLES_TABLE"
                placeholder="Productos"
                value={config.SQL_ARTICLES_TABLE}
                handleChange={handleChange}
                darkMode={darkMode}
                helperText="Vista o tabla del cliente. Por defecto: Productos."
              />
            </>
          )}

          <View style={styles.inlineActions}>
            <TouchableOpacity
              style={[
                styles.smallButton,
                { backgroundColor: theme.accent },
                testing && styles.buttonDisabled,
              ]}
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
              <Text style={styles.smallButtonText}>{testButtonLabel}</Text>
            </TouchableOpacity>

            {activeMode === "LOCAL" ? (
              <TouchableOpacity
                style={[
                  styles.smallButton,
                  { backgroundColor: theme.success },
                  syncing && styles.buttonDisabled,
                ]}
                onPress={syncNow}
                disabled={syncing}
              >
                {syncing ? (
                  <ActivityIndicator color={Colors.WHITE} />
                ) : (
                  <Ionicons
                    name="cloud-upload-outline"
                    size={18}
                    color={Colors.WHITE}
                  />
                )}
                <Text style={styles.smallButtonText}>Sincronizar ahora</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={{ marginTop: 12 }}>
            <ConnectionStatusCard
              result={connectionResult}
              theme={theme}
              darkMode={darkMode}
            />
          </View>
        </View>

        <View
          style={[styles.card, { backgroundColor: theme.surface }, Shadow.sm]}
        >
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Modo oscuro
          </Text>
          <ThemeSwitcher
            value={config.TEMA_OSCURO}
            onChange={async (value) => {
              handleChange("TEMA_OSCURO", value);
              setConfig((current) => ({ ...current, TEMA_OSCURO: value }));
              await Configuration.setConfigValue(
                "TEMA_OSCURO",
                value ? "1" : "0",
              );
              await refreshTheme();
            }}
            darkMode={darkMode}
          />
        </View>

        <View
          style={[
            styles.actionsCard,
            { backgroundColor: theme.surface },
            Shadow.sm,
          ]}
        >
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.accentDark }]}
            onPress={() => navigation.navigate("ConfigurationAdditionalScreen")}
          >
            <Ionicons name="options-outline" size={18} color={Colors.WHITE} />
            <Text style={styles.actionButtonText}>Configuración adicional</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.accent }]}
            onPress={() => navigation.navigate("PrintConfigurationScreen")}
          >
            <Ionicons name="print-outline" size={18} color={Colors.WHITE} />
            <Text style={styles.actionButtonText}>Configurar impresión</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.success }]}
            onPress={() => navigation.navigate("SunmiDiagnosticsScreen")}
          >
            <Ionicons name="medkit-outline" size={18} color={Colors.WHITE} />
            <Text style={styles.actionButtonText}>Diagnóstico Sunmi</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.accent }]}
            onPress={saveConfiguration}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={Colors.WHITE} />
            ) : (
              <Ionicons name="save-outline" size={18} color={Colors.WHITE} />
            )}
            <Text style={styles.actionButtonText}>Guardar configuración</Text>
          </TouchableOpacity>
        </View>

        {!!status ? (
          <View
            style={[styles.card, { backgroundColor: theme.surface }, Shadow.sm]}
          >
            <Text style={[styles.statusText, { color: theme.text }]}>
              {status}
            </Text>
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
  sectionHint: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: Fonts.body,
    marginBottom: 10,
  },
  modeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  modeChip: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
  },
  modeChipText: {
    fontFamily: Fonts.display,
    fontSize: 13,
  },
  fieldLabel: {
    fontSize: 13,
    marginTop: 12,
    color: Colors.BLACK,
    fontFamily: Fonts.body,
    letterSpacing: 0.3,
  },
  fieldLabelDark: {
    color: "#E8F0F8",
  },
  passwordWrap: {
    marginVertical: 8,
    borderColor: Colors.BORDER,
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: Colors.SURFACE,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  passwordWrapDark: {
    backgroundColor: "#152332",
    borderColor: "#2D4154",
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: Colors.BLACK,
    fontFamily: Fonts.body,
  },
  passwordInputDark: {
    color: "#E8F0F8",
  },
  passwordIconButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inlineActions: {
    marginTop: 8,
    gap: 10,
  },
  smallButton: {
    minHeight: 48,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  buttonDisabled: {
    opacity: 0.72,
  },
  smallButtonText: {
    color: Colors.WHITE,
    fontFamily: Fonts.display,
    fontSize: 14,
  },
  connectionCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  connectionIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  connectionTextWrap: {
    flex: 1,
  },
  connectionTitle: {
    fontFamily: Fonts.display,
    fontSize: 16,
    marginBottom: 2,
  },
  connectionSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  connectionDetail: {
    fontFamily: Fonts.body,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 6,
  },
  themeSelector: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D0D9E2",
    backgroundColor: "#F3F7FB",
    padding: 4,
  },
  themeSelectorDark: {
    backgroundColor: "#1F2935",
    borderColor: "#324255",
  },
  themeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
  },
  themeOptionActiveLight: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E3EDF7",
  },
  themeOptionActiveDark: {
    backgroundColor: "#152332",
    borderWidth: 1,
    borderColor: "#2D4154",
  },
  themeOptionText: {
    fontFamily: Fonts.display,
    fontSize: 14,
  },
  actionsCard: {
    borderRadius: Radii.xl,
    padding: 16,
    marginBottom: 14,
    gap: 10,
  },
  actionButton: {
    minHeight: 48,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 14,
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
