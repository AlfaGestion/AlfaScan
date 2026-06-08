import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import MSSQL from "react-native-mssql";

import ConfigItem from "@components/ConfigItem";
import Configuration from "@db/Configuration";
import Colors from "@styles/Colors";
import { Fonts, Radii, Shadow } from "@styles/Theme";
import { useThemeConfig } from "@context/ThemeContext";
import { syncCatalogToLocal } from "@services/catalogService";

const MODE_OPTIONS = [
  { label: "AlfaNet / API", value: "API" },
  { label: "SQL Local", value: "LOCAL" },
  { label: "SQL Online", value: "ONLINE" },
];

const ALIGNMENT_OPTIONS = [
  { label: "Izquierda", value: "left" },
  { label: "Centro", value: "center" },
  { label: "Derecha", value: "right" },
];

const DEFAULT_PRINT_FORMATS = [
  {
    key: "gondola",
    name: "Gondola",
    paperWidth: "80",
    descriptionFontSize: "22",
    priceFontSize: "34",
    showBarcode: true,
    showPrice: true,
    showDescription: true,
    showStock: false,
    showDate: true,
    showCompanyName: false,
    showInternalCode: false,
    copies: "1",
    marginTop: "0",
    marginBottom: "0",
    alignment: "center",
    boldPrice: true,
    previewBeforePrint: true,
  },
  {
    key: "product",
    name: "Producto",
    paperWidth: "80",
    descriptionFontSize: "16",
    priceFontSize: "24",
    showBarcode: true,
    showPrice: true,
    showDescription: true,
    showStock: false,
    showDate: false,
    showCompanyName: false,
    showInternalCode: false,
    copies: "1",
    marginTop: "0",
    marginBottom: "0",
    alignment: "center",
    boldPrice: true,
    previewBeforePrint: true,
  },
  {
    key: "small",
    name: "Precio Chico",
    paperWidth: "58",
    descriptionFontSize: "12",
    priceFontSize: "20",
    showBarcode: true,
    showPrice: true,
    showDescription: true,
    showStock: false,
    showDate: false,
    showCompanyName: false,
    showInternalCode: false,
    copies: "1",
    marginTop: "0",
    marginBottom: "0",
    alignment: "center",
    boldPrice: true,
    previewBeforePrint: true,
  },
  {
    key: "custom",
    name: "Personalizado",
    paperWidth: "80",
    descriptionFontSize: "16",
    priceFontSize: "24",
    showBarcode: true,
    showPrice: true,
    showDescription: true,
    showStock: true,
    showDate: true,
    showCompanyName: true,
    showInternalCode: true,
    copies: "1",
    marginTop: "0",
    marginBottom: "0",
    alignment: "center",
    boldPrice: true,
    previewBeforePrint: true,
  },
];

const DEFAULT_CONFIG = {
  CONNECTION_TYPE: "API",
  API_URI: "",
  API_ACCOUNT_CODE: "",
  API_USER: "",
  API_PASSWORD: "",
  API_BASE_ID: "",
  API_TIMEOUT: "15",
  API_SSL: false,
  SQL_SERVER: "",
  SQL_INSTANCE: "",
  SQL_PORT: "",
  SQL_DATABASE: "",
  SQL_USER: "",
  SQL_PASSWORD: "",
  SQL_TABLE_VIEW: "dbo.Articulos",
  SQL_BARCODE_FIELD: "codigoBarra",
  SQL_DESCRIPTION_FIELD: "descripcion",
  SQL_PRICE_FIELD: "precio",
  SQL_STOCK_FIELD: "stock",
  SQL_TIMEOUT: "15",
  SQL_MODE: "LOCAL",
  TEMA_OSCURO: false,
};

const BOOLEAN_KEYS = new Set(["API_SSL", "TEMA_OSCURO"]);

const parseConnectionMode = (config) => {
  const current = String(config.CONNECTION_TYPE ?? "").trim().toUpperCase();
  if (current === "API" || current === "LOCAL" || current === "ONLINE") {
    return current;
  }

  const legacySqlMode = String(config.SQL_MODE ?? "").trim().toUpperCase();
  if (legacySqlMode === "ONLINE") {
    return "ONLINE";
  }
  if (legacySqlMode === "LOCAL") {
    return "LOCAL";
  }

  return "API";
};

const parsePrintFormats = (value) => {
  if (!value) {
    return DEFAULT_PRINT_FORMATS;
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_PRINT_FORMATS;
    }

    return DEFAULT_PRINT_FORMATS.map((fallback, index) => ({
      ...fallback,
      ...(parsed[index] || {}),
      key: fallback.key,
      name: String(parsed[index]?.name ?? fallback.name),
    }));
  } catch (e) {
    return DEFAULT_PRINT_FORMATS;
  }
};

const serializePrintFormats = (formats) => JSON.stringify(formats);

const normalizeSqlMode = (mode) => {
  if (mode === "ONLINE") {
    return "ONLINE";
  }
  if (mode === "LOCAL") {
    return "LOCAL";
  }
  return "LOCAL";
};

const buildSqlTarget = (config) => {
  const rawServer = String(config.SQL_SERVER ?? "").trim();
  const rawInstance = String(config.SQL_INSTANCE ?? "").trim();
  const rawPort = parseInt(String(config.SQL_PORT ?? "").trim(), 10);

  if (!rawServer) {
    return { server: "", port: undefined };
  }

  if (rawServer.includes("\\") || rawServer.includes(",")) {
    const portFromRaw = rawServer.includes(",")
      ? parseInt(rawServer.split(",").slice(1).join(","), 10)
      : 0;

    return {
      server: rawServer,
      port: Number.isFinite(portFromRaw) && portFromRaw > 0 ? portFromRaw : undefined,
    };
  }

  if (rawInstance) {
    return { server: `${rawServer}\\${rawInstance}`, port: undefined };
  }

  if (Number.isFinite(rawPort) && rawPort > 0) {
    return { server: rawServer, port: rawPort };
  }

  return { server: rawServer, port: undefined };
};

const SectionTitle = ({ children, color }) => (
  <Text style={[styles.sectionTitle, { color }]}>{children}</Text>
);

const ActionButton = ({ label, icon, onPress, backgroundColor, color, disabled = false }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    style={[
      styles.actionButton,
      { backgroundColor, opacity: disabled ? 0.7 : 1 },
    ]}
  >
    <Ionicons name={icon} size={18} color={color} />
    <Text style={[styles.actionButtonText, { color }]}>{label}</Text>
  </TouchableOpacity>
);

const BooleanRow = ({ title, field, value, handleChange, darkMode }) => (
  <ConfigItem
    type="checkbox"
    title={title}
    field={field}
    value={value}
    handleChange={handleChange}
    darkMode={darkMode}
  />
);

const PrintFormatEditor = ({ format, index, onChange, darkMode, accentColor }) => (
  <View style={[styles.formatCard, darkMode && styles.formatCardDark]}>
    <Text style={[styles.formatTitle, { color: accentColor }]}>Formato {index + 1}</Text>
    <ConfigItem
      type="input"
      title="Nombre"
      field="name"
      placeholder="Gondola"
      value={format.name}
      handleChange={(field, value) => onChange(field, value)}
      darkMode={darkMode}
    />
    <ConfigItem
      type="input"
      title="Ancho de papel (mm)"
      field="paperWidth"
      placeholder="80"
      value={format.paperWidth}
      keyboardType="numeric"
      handleChange={(field, value) => onChange(field, value)}
      darkMode={darkMode}
    />
    <ConfigItem
      type="input"
      title="Tamano fuente descripcion"
      field="descriptionFontSize"
      placeholder="16"
      value={format.descriptionFontSize}
      keyboardType="numeric"
      handleChange={(field, value) => onChange(field, value)}
      darkMode={darkMode}
    />
    <ConfigItem
      type="input"
      title="Tamano fuente precio"
      field="priceFontSize"
      placeholder="24"
      value={format.priceFontSize}
      keyboardType="numeric"
      handleChange={(field, value) => onChange(field, value)}
      darkMode={darkMode}
    />
    <ConfigItem
      type="select"
      title="Alineacion"
      field="alignment"
      value={format.alignment}
      options={ALIGNMENT_OPTIONS}
      handleChange={(field, value) => onChange(field, value)}
      darkMode={darkMode}
    />
    <ConfigItem
      type="input"
      title="Cantidad de copias"
      field="copies"
      placeholder="1"
      value={format.copies}
      keyboardType="numeric"
      handleChange={(field, value) => onChange(field, value)}
      darkMode={darkMode}
    />
    <ConfigItem
      type="input"
      title="Margen superior"
      field="marginTop"
      placeholder="0"
      value={format.marginTop}
      keyboardType="numeric"
      handleChange={(field, value) => onChange(field, value)}
      darkMode={darkMode}
    />
    <ConfigItem
      type="input"
      title="Margen inferior"
      field="marginBottom"
      placeholder="0"
      value={format.marginBottom}
      keyboardType="numeric"
      handleChange={(field, value) => onChange(field, value)}
      darkMode={darkMode}
    />
    <BooleanRow title="Mostrar codigo de barra" field="showBarcode" value={format.showBarcode} handleChange={onChange} darkMode={darkMode} />
    <BooleanRow title="Mostrar precio" field="showPrice" value={format.showPrice} handleChange={onChange} darkMode={darkMode} />
    <BooleanRow title="Mostrar descripcion" field="showDescription" value={format.showDescription} handleChange={onChange} darkMode={darkMode} />
    <BooleanRow title="Mostrar stock" field="showStock" value={format.showStock} handleChange={onChange} darkMode={darkMode} />
    <BooleanRow title="Mostrar fecha" field="showDate" value={format.showDate} handleChange={onChange} darkMode={darkMode} />
    <BooleanRow title="Mostrar nombre empresa" field="showCompanyName" value={format.showCompanyName} handleChange={onChange} darkMode={darkMode} />
    <BooleanRow title="Mostrar codigo interno" field="showInternalCode" value={format.showInternalCode} handleChange={onChange} darkMode={darkMode} />
    <BooleanRow title="Precio en negrita" field="boldPrice" value={format.boldPrice} handleChange={onChange} darkMode={darkMode} />
    <BooleanRow title="Vista previa antes de imprimir" field="previewBeforePrint" value={format.previewBeforePrint} handleChange={onChange} darkMode={darkMode} />
  </View>
);

export default function ConfigurationScreen({ navigation }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [printFormats, setPrintFormats] = useState(DEFAULT_PRINT_FORMATS);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [activeMode, setActiveMode] = useState("API");
  const { darkMode, refreshTheme } = useThemeConfig();

  const theme = useMemo(
    () => ({
      background: darkMode ? "#0F1720" : "#E8F2FC",
      surface: darkMode ? "#16212D" : Colors.SURFACE,
      text: darkMode ? "#E8F0F8" : Colors.DGREY,
      muted: darkMode ? "#BFD0E0" : Colors.MUTED,
      border: darkMode ? "#243241" : Colors.BORDER,
      accent: "#1E88E5",
      accentDark: "#0B5FA5",
      success: "#1F8B4C",
    }),
    [darkMode]
  );

  const loadConfiguration = useCallback(async () => {
    await Configuration.createTable();
    const rows = await Configuration.query();
    const nextConfig = { ...DEFAULT_CONFIG };
    let formatsRaw = "";

    rows.forEach((item) => {
      const key = String(item.key ?? "").trim();
      const value = item.value;

      if (key === "PRINT_FORMATS_JSON") {
        formatsRaw = String(value ?? "");
        return;
      }

      if (key === "ALFA_ACCOUNT") {
        nextConfig.API_ACCOUNT_CODE = String(value ?? "");
        return;
      }

      if (key === "USERNAME_SYNC") {
        nextConfig.API_USER = String(value ?? "");
        return;
      }

      if (key === "PASSWORD_SYNC") {
        nextConfig.API_PASSWORD = String(value ?? "");
        return;
      }

      if (key === "ALFA_DATABASE_ID") {
        nextConfig.API_BASE_ID = String(value ?? "");
        return;
      }

      if (key === "API_URI") {
        nextConfig.API_URI = String(value ?? "");
        return;
      }

      if (key === "SQL_MODE") {
        nextConfig.SQL_MODE = String(value ?? "").toUpperCase() || "LOCAL";
        return;
      }

      if (key === "CONNECTION_TYPE") {
        nextConfig.CONNECTION_TYPE = String(value ?? "").toUpperCase() || "API";
        return;
      }

      if (Object.prototype.hasOwnProperty.call(nextConfig, key)) {
        nextConfig[key] = BOOLEAN_KEYS.has(key) ? Configuration.isTruthyConfigValue(value) : String(value ?? "");
      }
    });

    nextConfig.CONNECTION_TYPE = parseConnectionMode(nextConfig);
    setActiveMode(nextConfig.CONNECTION_TYPE);
    setConfig(nextConfig);
    setPrintFormats(parsePrintFormats(formatsRaw));
  }, []);

  useEffect(() => {
    loadConfiguration();
  }, [loadConfiguration]);

  useFocusEffect(
    useCallback(() => {
      loadConfiguration();
    }, [loadConfiguration])
  );

  useEffect(() => {
    setConfig((current) => ({
      ...current,
      SQL_MODE: normalizeSqlMode(activeMode),
    }));
  }, [activeMode]);

  const handleChange = (field, value) => {
    setConfig((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleModeChange = (mode) => {
    setActiveMode(mode);
  };

  const updatePrintFormat = (index, field, value) => {
    setPrintFormats((current) =>
      current.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
    );
  };

  const validateConfig = () => {
    if (activeMode === "API") {
      if (!String(config.API_URI).trim()) throw new Error("Complete la ruta web service.");
      if (!String(config.API_ACCOUNT_CODE).trim()) throw new Error("Complete el codigo de cuenta AlfaNet.");
      if (!String(config.API_USER).trim()) throw new Error("Complete el usuario.");
      if (!String(config.API_PASSWORD).trim()) throw new Error("Complete la password.");
      if (!String(config.API_BASE_ID).trim()) throw new Error("Complete el ID base.");
    }

    if (activeMode === "LOCAL" || activeMode === "ONLINE") {
      if (!String(config.SQL_SERVER).trim()) throw new Error("Complete el servidor SQL.");
      if (!String(config.SQL_DATABASE).trim()) throw new Error("Complete la base de datos SQL.");
      if (!String(config.SQL_USER).trim()) throw new Error("Complete el usuario SQL.");
      if (!String(config.SQL_PASSWORD).trim()) throw new Error("Complete la contrasena SQL.");
      if (!String(config.SQL_TABLE_VIEW).trim()) throw new Error("Complete la tabla o vista de articulos.");
    }
  };

  const saveConfiguration = async () => {
    setSaving(true);
    setStatus("");

    try {
      validateConfig();
      await Configuration.createTable();

      const payload = {
        ...config,
        CONNECTION_TYPE: activeMode,
        SQL_MODE: normalizeSqlMode(activeMode),
        API_SSL: !!config.API_SSL,
        TEMA_OSCURO: !!config.TEMA_OSCURO,
        PRINT_FORMATS_JSON: serializePrintFormats(printFormats),
        ALFA_ACCOUNT: config.API_ACCOUNT_CODE,
        USERNAME_SYNC: config.API_USER,
        PASSWORD_SYNC: config.API_PASSWORD,
        ALFA_DATABASE_ID: config.API_BASE_ID,
      };

      for (const [key, rawValue] of Object.entries(payload)) {
        let value = rawValue;
        if (BOOLEAN_KEYS.has(key)) {
          value = value ? "1" : "0";
        }
        if (value === null || value === undefined) {
          value = "";
        }
        await Configuration.setConfigValue(key, String(value).trim());
      }

      setStatus("Configuracion guardada correctamente.");
      await refreshTheme();
    } catch (e) {
      setStatus(e?.message || "No se pudo guardar la configuracion.");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTestLoading(true);
    setStatus("");

    try {
      validateConfig();

      if (activeMode === "API") {
        const response = await fetch(String(config.API_URI).trim(), { method: "GET" });
        if (!response) {
          throw new Error("No fue posible contactar la ruta web service.");
        }
        setStatus("Conexion API verificada.");
        return;
      }

      const target = buildSqlTarget(config);
      await MSSQL.connect({
        server: target.server,
        username: String(config.SQL_USER).trim(),
        password: String(config.SQL_PASSWORD),
        database: String(config.SQL_DATABASE).trim(),
        port: target.port,
        timeout: Number(config.SQL_TIMEOUT || config.API_TIMEOUT || 15),
      });
      await MSSQL.close();
      setStatus("Conexion SQL verificada.");
    } catch (e) {
      setStatus(e?.message || "No se pudo probar la conexion.");
      try {
        await MSSQL.close();
      } catch (closeError) {
        // ignore close errors
      }
    } finally {
      setTestLoading(false);
    }
  };

  const syncNow = async () => {
    if (activeMode !== "LOCAL") {
      Alert.alert("AlfaScan", "La sincronizacion manual solo aplica en SQL Local.");
      return;
    }

    setSyncLoading(true);
    setStatus("");

    try {
      const result = await syncCatalogToLocal({
        onProgress: ({ inserted, page }) => {
          setStatus(`Sincronizando catalogo... ${inserted} registros importados (lote ${page}).`);
        },
      });

      const now = new Date().toISOString();
      await Configuration.setConfigValue("LAST_SYNC_AT", now);
      setStatus(`Sincronizacion completada. Registros importados: ${result.inserted}.`);
    } catch (e) {
      setStatus(e?.message || "No se pudo sincronizar el catalogo.");
    } finally {
      setSyncLoading(false);
    }
  };

  const sqlFields = [
    { title: "Servidor SQL", field: "SQL_SERVER", placeholder: "SERVIDOR, IP o IP\\INSTANCIA" },
    { title: "Instancia SQL opcional", field: "SQL_INSTANCE", placeholder: "SQLEXPRESS" },
    { title: "Puerto opcional", field: "SQL_PORT", placeholder: "1433", keyboardType: "numeric" },
    { title: "Base de datos", field: "SQL_DATABASE", placeholder: "MiBase" },
    { title: "Usuario", field: "SQL_USER", placeholder: "sa" },
    { title: "Contrasena", field: "SQL_PASSWORD", placeholder: "********", secureTextEntry: true },
    { title: "Tabla o vista de articulos", field: "SQL_TABLE_VIEW", placeholder: "dbo.Articulos" },
    { title: "Campo codigo de barra", field: "SQL_BARCODE_FIELD", placeholder: "codigoBarra" },
    { title: "Campo descripcion", field: "SQL_DESCRIPTION_FIELD", placeholder: "descripcion" },
    { title: "Campo precio", field: "SQL_PRICE_FIELD", placeholder: "precio" },
    { title: "Campo stock opcional", field: "SQL_STOCK_FIELD", placeholder: "stock" },
    { title: "Timeout SQL (segundos)", field: "SQL_TIMEOUT", placeholder: "15", keyboardType: "numeric" },
  ];

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: theme.surface }, Shadow.sm]}>
          <Text style={[styles.title, { color: theme.text }]}>Configuracion AlfaScan</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>
            Defina el modo de uso, los datos de conexion y los formatos de impresion.
          </Text>

          <View style={styles.modeRow}>
            {MODE_OPTIONS.map((item) => {
              const active = activeMode === item.value;
              return (
                <TouchableOpacity
                  key={item.value}
                  style={[
                    styles.modeChip,
                    {
                      backgroundColor: active ? theme.accent : theme.surface,
                      borderColor: active ? theme.accent : theme.border,
                    },
                  ]}
                  onPress={() => handleModeChange(item.value)}
                >
                  <Text style={[styles.modeChipText, { color: active ? Colors.WHITE : theme.text }]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {activeMode === "API" ? (
            <>
              <SectionTitle color={theme.text}>Configuracion AlfaNet / API</SectionTitle>
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
                title="Codigo cuenta AlfaNet"
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
              <ConfigItem
                type="input"
                title="Password"
                field="API_PASSWORD"
                placeholder="********"
                value={config.API_PASSWORD}
                secureTextEntry
                handleChange={handleChange}
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
              <BooleanRow
                title="Usar SSL"
                field="API_SSL"
                value={config.API_SSL}
                handleChange={handleChange}
                darkMode={darkMode}
              />
            </>
          ) : (
            <>
              <SectionTitle color={theme.text}>Configuracion SQL</SectionTitle>
              <Text style={[styles.helperText, { color: theme.muted }]}>
                El formato del servidor soporta SERVIDOR, IP, SERVIDOR\INSTANCIA, IP\INSTANCIA, IP,PUERTO y SERVIDOR,PUERTO.
              </Text>
              {sqlFields.map((item) => (
                <ConfigItem
                  key={item.field}
                  type="input"
                  title={item.title}
                  field={item.field}
                  placeholder={item.placeholder}
                  value={config[item.field]}
                  keyboardType={item.keyboardType || "default"}
                  secureTextEntry={item.secureTextEntry || false}
                  handleChange={handleChange}
                  darkMode={darkMode}
                />
              ))}
              <TouchableOpacity
                style={[styles.smallButton, { backgroundColor: theme.accent }]}
                onPress={testConnection}
                disabled={testLoading}
              >
                {testLoading ? <ActivityIndicator color={Colors.WHITE} /> : <Ionicons name="checkmark-circle-outline" size={18} color={Colors.WHITE} />}
                <Text style={styles.smallButtonText}>Probar conexion</Text>
              </TouchableOpacity>
              {activeMode === "LOCAL" ? (
                <TouchableOpacity
                  style={[styles.smallButton, { backgroundColor: theme.success }]}
                  onPress={syncNow}
                  disabled={syncLoading}
                >
                  {syncLoading ? <ActivityIndicator color={Colors.WHITE} /> : <Ionicons name="sync-outline" size={18} color={Colors.WHITE} />}
                  <Text style={styles.smallButtonText}>Sincronizar ahora</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface }, Shadow.sm]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Configuracion de impresion</Text>
          <Text style={[styles.helperText, { color: theme.muted }]}>
            Se pueden editar hasta 4 formatos. El formato personalizado deja activos todos los campos.
          </Text>

          {printFormats.map((format, index) => (
            <PrintFormatEditor
              key={format.key}
              format={format}
              index={index}
              darkMode={darkMode}
              accentColor={theme.accent}
              onChange={(field, value) => updatePrintFormat(index, field, value)}
            />
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface }, Shadow.sm]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Opciones generales</Text>
          <BooleanRow
            title="Tema oscuro"
            field="TEMA_OSCURO"
            value={config.TEMA_OSCURO}
            handleChange={handleChange}
            darkMode={darkMode}
          />
        </View>

        <View style={[styles.actionsCard, { backgroundColor: theme.surface }, Shadow.sm]}>
          <ActionButton
            label="Probar conexion"
            icon="flash-outline"
            onPress={testConnection}
            backgroundColor={theme.accent}
            color={Colors.WHITE}
            disabled={testLoading}
          />
          <ActionButton
            label="Guardar configuracion"
            icon="save-outline"
            onPress={saveConfiguration}
            backgroundColor={theme.accentDark}
            color={Colors.WHITE}
            disabled={saving}
          />
        </View>

        {!!status ? (
          <View style={[styles.card, { backgroundColor: theme.surface }, Shadow.sm]}>
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
  sectionLabel: {
    fontSize: 16,
    fontFamily: Fonts.display,
    marginBottom: 8,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: Fonts.body,
    marginBottom: 6,
  },
  modeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  modeChip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
  },
  modeChipText: {
    fontFamily: Fonts.display,
    fontSize: 13,
  },
  formatCard: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    padding: 14,
    marginBottom: 12,
  },
  formatCardDark: {
    borderColor: "#243241",
  },
  formatTitle: {
    fontFamily: Fonts.display,
    fontSize: 16,
    marginBottom: 8,
  },
  smallButton: {
    minHeight: 48,
    borderRadius: 16,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  smallButtonText: {
    color: Colors.WHITE,
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
    fontFamily: Fonts.display,
    fontSize: 14,
  },
  statusText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.body,
  },
});
