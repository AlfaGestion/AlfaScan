import { useEffect, useLayoutEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import SafeAreaView from "react-native-safe-area-view";
import { Ionicons } from "@expo/vector-icons";

import { ConfigStyles } from "@styles/ConfigurationStyle";
import ConfigItem from "@components/ConfigItem";
import Configuration from "@db/Configuration";
import { useThemeConfig } from "@context/ThemeContext";
import { restartTables } from "../services/db";
import { syncCatalogToLocal } from "@services/catalogService";
import iconSave from "@icons/ok.png";
import iconSync from "@icons/sync.png";

const BOOLEAN_CONFIG_KEYS = new Set([
  "MODIFICA_CLASE_PRECIO",
  "SOLO_CLIENTES_VENDEDOR",
  "STOCK_ONLINE_CONSULTAS",
  "STOCK_COMPROMETIDO_REAL",
  "MOSTRAR_TOTALES_PEDIDOS",
  "PERMITE_EFC",
  "PERMITE_FP",
  "PRINT_SUNMI",
  "CARGA_IMAGENES",
  "NO_PERMITE_ITEMS_DUPLICADOS_CPTE",
  "TEMA_OSCURO",
]);

const SQL_MODE_OPTIONS = [
  { label: "SQL Online", value: "ONLINE" },
  { label: "SQL Local", value: "LOCAL" },
];

const SQL_CONNECTION_MODE_OPTIONS = [
  { label: "Auto", value: "AUTO" },
  { label: "Nombre de servidor", value: "SERVER" },
  { label: "IP", value: "IP" },
  { label: "Instancia SQL", value: "INSTANCE" },
  { label: "Puerto", value: "PORT" },
  { label: "Personalizado", value: "CUSTOM" },
];

const DEFAULT_CONFIG = {
  API_URI: "http://alfanetac.ddns.net:7705/api/v2/",
  API_KEY: "",
  ALFA_ACCOUNT: "112010001",
  ALFA_DATABASE_ID: "3239",
  USERNAME_SYNC: "Administrador",
  PASSWORD_SYNC: "1",
  MODIFICA_CLASE_PRECIO: false,
  SOLO_CLIENTES_VENDEDOR: false,
  STOCK_ONLINE_CONSULTAS: false,
  STOCK_COMPROMETIDO_REAL: false,
  MOSTRAR_TOTALES_PEDIDOS: false,
  PERMITE_EFC: false,
  PERMITE_FP: false,
  TOP_CONSULTA_ARTICULOS: "0",
  DESCUENTO_POR_ARTICULO: "0",
  PERMITE_COBRANZAS: "0",
  PERMITE_VER_CTACTE: "0",
  TOKEN: "",
  PRINT_SUNMI: false,
  CARGA_IMAGENES: false,
  NO_PERMITE_ITEMS_DUPLICADOS_CPTE: false,
  TEMA_OSCURO: false,
  SQL_MODE: "LOCAL",
  SQL_CONNECTION_MODE: "AUTO",
  SQL_SERVER: "",
  SQL_INSTANCE: "",
  SQL_PORT: "",
  SQL_USER: "",
  SQL_PASSWORD: "",
  SQL_DATABASE: "",
  SQL_TABLE_VIEW: "dbo.Articulos",
  SQL_TIMEOUT: "15",
  SQL_SYNC_BATCH_SIZE: "250",
};

const REQUIRED_SQL_FIELDS = ["SQL_SERVER", "SQL_USER", "SQL_PASSWORD", "SQL_DATABASE", "SQL_TABLE_VIEW"];

const SectionTitle = ({ children, darkMode }) => (
  <Text style={[ConfigStyles.textDeletingTables, { marginTop: 18, marginBottom: 6 }, darkMode && { color: "#E8F0F8" }]}>
    {children}
  </Text>
);

export default function ConfigurationScreen({ navigation, route }) {
  const { firstIn = null } = route?.params || {};
  const { refreshTheme } = useThemeConfig();

  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [showText, setShowText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [syncingCatalog, setSyncingCatalog] = useState(false);

  const loadConfiguration = async () => {
    await Configuration.createTable();
    const data = await Configuration.query();

    const configUpdate = {};
    data.forEach((item) => {
      configUpdate[item.key] = BOOLEAN_CONFIG_KEYS.has(item.key)
        ? Configuration.isTruthyConfigValue(item.value)
        : item.value;
    });

    setConfig((current) => ({
      ...current,
      ...configUpdate,
    }));
  };

  useEffect(() => {
    loadConfiguration();
  }, []);

  const handleChange = (name, value) => {
    setConfig((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const validateSqlConfig = () => {
    const missing = REQUIRED_SQL_FIELDS.find((field) => !String(config[field] ?? "").trim());
    if (missing) {
      throw new Error("Complete servidor, usuario, contrasena, base de datos y tabla/vista SQL.");
    }
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      validateSqlConfig();

      await Configuration.createTable();
      for (const item in config) {
        let value = config[item];
        if (BOOLEAN_CONFIG_KEYS.has(item)) {
          value = value ? "1" : "0";
        }
        if (value === null || value === undefined) {
          value = "";
        }
        if (item === "API_URI" || item === "SQL_SERVER" || item === "SQL_TABLE_VIEW" || item === "SQL_DATABASE" || item === "SQL_USER" || item === "SQL_INSTANCE") {
          value = String(value).trim();
        }
        await Configuration.setConfigValue(item, value);
      }
      setShowText("Grabado correctamente");
      await refreshTheme();
    } catch (e) {
      setShowText(e?.message || "Error al grabar configuracion.");
    } finally {
      setSaving(false);
    }

    if (firstIn) {
      if (
        config.ALFA_ACCOUNT !== "" &&
        config.API_URI !== "" &&
        config.PASSWORD_SYNC !== "" &&
        config.USERNAME_SYNC !== "" &&
        config.ALFA_DATABASE_ID !== ""
      ) {
        navigation.navigate("SyncScreen", { firstIn: true });
      } else {
        setShowText("Debe configurar la API URL, el codigo de cuenta de Alfanet, el usuario y la contrasena");
      }
    } else {
      navigation.navigate("HomeScreen");
    }
  };

  const handleDeleteTables = async () => {
    setDeleting(true);
    try {
      await restartTables();
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudieron reiniciar las tablas.");
    } finally {
      setDeleting(false);
    }
  };

  const handleSyncCatalog = async () => {
    setSyncingCatalog(true);
    try {
      validateSqlConfig();
      const result = await syncCatalogToLocal({
        onProgress: ({ inserted, page }) => {
          setShowText(`Sincronizando catálogo... ${inserted} registros importados (lote ${page}).`);
        },
      });
      setShowText(`Catálogo sincronizado. Registros importados: ${result.inserted}`);
    } catch (e) {
      setShowText(e?.message || "No se pudo sincronizar el catálogo.");
    } finally {
      setSyncingCatalog(false);
    }
  };

  const showAlert = () =>
    Alert.alert(
      "ATENCION",
      "Este proceso eliminara todos los datos cargados. Incluyendo pedidos y maestros. Se recomienda sincronizar antes de realizarlo, ya que la informacion no se podra recuperar.",
      [
        { text: "Cancelar", style: "destructive" },
        {
          text: "Reiniciar",
          onPress: () => handleDeleteTables(),
          style: "default",
        },
      ]
    );

  const darkMode = config.TEMA_OSCURO === true;

  return (
    <SafeAreaView style={[ConfigStyles.mainContainer, { backgroundColor: darkMode ? "#101821" : "#F3F7FC" }]}>
      <View style={[ConfigStyles.container, { backgroundColor: darkMode ? "#101821" : "#F3F7FC" }]}>
        <ScrollView style={{ backgroundColor: darkMode ? "#101821" : "#F3F7FC" }} contentContainerStyle={{ paddingBottom: 20 }}>
          <SectionTitle darkMode={darkMode}>Compatibilidad AlfaNet</SectionTitle>

          <ConfigItem
            type="input"
            title="Ruta Web Service (*)"
            placeholder="API URL"
            field="API_URI"
            value={config.API_URI}
            handleChange={handleChange}
            darkMode={darkMode}
          />
          <ConfigItem
            type="input"
            title="Codigo Cuenta AlfaNet (*)"
            field="ALFA_ACCOUNT"
            placeholder="Ej. 112010001"
            value={config.ALFA_ACCOUNT}
            handleChange={handleChange}
            darkMode={darkMode}
          />
          <ConfigItem
            type="input"
            title="Usuario Sync (*)"
            field="USERNAME_SYNC"
            placeholder="..."
            value={`${config.USERNAME_SYNC}`}
            handleChange={handleChange}
            darkMode={darkMode}
          />
          <ConfigItem
            type="input"
            title="Password Sync (*)"
            field="PASSWORD_SYNC"
            placeholder="..."
            value={`${config.PASSWORD_SYNC}`}
            handleChange={handleChange}
            secureTextEntry
            darkMode={darkMode}
          />
          <ConfigItem
            type="input"
            title="ID Database (*)"
            field="ALFA_DATABASE_ID"
            placeholder="..."
            value={`${config.ALFA_DATABASE_ID}`}
            handleChange={handleChange}
            darkMode={darkMode}
          />

          <SectionTitle darkMode={darkMode}>SQL del lector</SectionTitle>

          <ConfigItem
            type="select"
            title="Modo SQL"
            field="SQL_MODE"
            value={config.SQL_MODE}
            options={SQL_MODE_OPTIONS}
            handleChange={handleChange}
            helperText="SQL Online consulta directamente el servidor. SQL Local sincroniza al dispositivo y luego lee desde SQLite."
            darkMode={darkMode}
          />

          <ConfigItem
            type="select"
            title="Modo de conexión"
            field="SQL_CONNECTION_MODE"
            value={config.SQL_CONNECTION_MODE}
            options={SQL_CONNECTION_MODE_OPTIONS}
            handleChange={handleChange}
            helperText="El campo Servidor SQL admite NOMBRE_SERVIDOR, IP, IP\\INSTANCIA, NOMBRE\\INSTANCIA y NOMBRE,PUERTO."
            darkMode={darkMode}
          />

          <ConfigItem
            type="input"
            title="Servidor SQL"
            field="SQL_SERVER"
            placeholder="NOMBRE_SERVIDOR, IP, IP\\INSTANCIA o NOMBRE,PUERTO"
            value={config.SQL_SERVER}
            handleChange={handleChange}
            darkMode={darkMode}
          />
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
            value={`${config.SQL_PORT}`}
            keyboardType="numeric"
            handleChange={handleChange}
            darkMode={darkMode}
          />
          <ConfigItem
            type="input"
            title="Usuario SQL"
            field="SQL_USER"
            placeholder="sa"
            value={config.SQL_USER}
            handleChange={handleChange}
            darkMode={darkMode}
          />
          <ConfigItem
            type="input"
            title="Contraseña SQL"
            field="SQL_PASSWORD"
            placeholder="********"
            value={config.SQL_PASSWORD}
            handleChange={handleChange}
            secureTextEntry
            darkMode={darkMode}
          />
          <ConfigItem
            type="input"
            title="Base de datos SQL"
            field="SQL_DATABASE"
            placeholder="MiBase"
            value={config.SQL_DATABASE}
            handleChange={handleChange}
            darkMode={darkMode}
          />
          <ConfigItem
            type="input"
            title="Tabla o vista de artículos"
            field="SQL_TABLE_VIEW"
            placeholder="dbo.Articulos o dbo.vw_Articulos"
            value={config.SQL_TABLE_VIEW}
            handleChange={handleChange}
            darkMode={darkMode}
          />
          <ConfigItem
            type="input"
            title="Timeout SQL (segundos)"
            field="SQL_TIMEOUT"
            placeholder="15"
            value={`${config.SQL_TIMEOUT}`}
            keyboardType="numeric"
            handleChange={handleChange}
            darkMode={darkMode}
          />
          <ConfigItem
            type="input"
            title="Tamaño del lote de sincronización"
            field="SQL_SYNC_BATCH_SIZE"
            placeholder="250"
            value={`${config.SQL_SYNC_BATCH_SIZE}`}
            keyboardType="numeric"
            handleChange={handleChange}
            darkMode={darkMode}
          />

          <ConfigItem
            type="checkbox"
            title="Imprimir comprobante (SunmiV2)"
            field="PRINT_SUNMI"
            value={config.PRINT_SUNMI}
            handleChange={handleChange}
            darkMode={darkMode}
          />
          <ConfigItem
            type="checkbox"
            title="Utiliza imagenes web"
            field="CARGA_IMAGENES"
            value={config.CARGA_IMAGENES}
            handleChange={handleChange}
            darkMode={darkMode}
          />
          <ConfigItem
            type="checkbox"
            title="Valida item unico en comprobantes"
            field="NO_PERMITE_ITEMS_DUPLICADOS_CPTE"
            value={config.NO_PERMITE_ITEMS_DUPLICADOS_CPTE}
            handleChange={handleChange}
            darkMode={darkMode}
          />

          <View style={ConfigStyles.themeModeBlock}>
            <Text style={[ConfigStyles.themeModeTitle, darkMode && { color: "#E8F0F8" }]}>Tema</Text>
            <View style={[ConfigStyles.themeModeSelector, darkMode && ConfigStyles.themeModeSelectorDark]}>
              <TouchableOpacity
                onPress={() => handleChange("TEMA_OSCURO", false)}
                style={[
                  ConfigStyles.themeModeOption,
                  !darkMode && ConfigStyles.themeModeOptionActiveLight,
                ]}
              >
                <Ionicons name="sunny" size={18} color={!darkMode ? "#F57F17" : "#7A8A9A"} />
                <Text
                  style={[
                    ConfigStyles.themeModeText,
                    !darkMode ? ConfigStyles.themeModeTextActiveLight : ConfigStyles.themeModeTextInactive,
                  ]}
                >
                  Claro
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleChange("TEMA_OSCURO", true)}
                style={[
                  ConfigStyles.themeModeOption,
                  darkMode && ConfigStyles.themeModeOptionActiveDark,
                ]}
              >
                <Ionicons name="moon" size={18} color={darkMode ? "#8FC3FF" : "#7A8A9A"} />
                <Text
                  style={[
                    ConfigStyles.themeModeText,
                    darkMode ? ConfigStyles.themeModeTextActiveDark : ConfigStyles.themeModeTextInactive,
                  ]}
                >
                  Oscuro
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {!firstIn && (
            <TouchableOpacity style={[ConfigStyles.buttonRestartTables]} onPress={showAlert}>
              <Image source={iconSync} style={ConfigStyles.buttonIcon} />
              <Text style={[ConfigStyles.buttonRestartTablesText]}>Reiniciar tablas</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[ConfigStyles.buttonRestartTables, { opacity: syncingCatalog ? 0.7 : 1 }]}
            onPress={handleSyncCatalog}
            disabled={syncingCatalog}
          >
            <Image source={iconSync} style={ConfigStyles.buttonIcon} />
            <Text style={[ConfigStyles.buttonRestartTablesText]}>
              {syncingCatalog ? "Sincronizando catálogo..." : "Sincronizar catálogo SQL local"}
            </Text>
          </TouchableOpacity>

          {deleting && (
            <Text style={[ConfigStyles.textDeletingTables, darkMode && { color: "#E8F0F8" }]}>
              Reiniciando tablas... Aguarde.
            </Text>
          )}

          <TouchableOpacity disabled={deleting} style={[ConfigStyles.buttonSave]} onPress={handleSave}>
            <Image source={iconSave} style={ConfigStyles.buttonIcon} />
            <Text style={[ConfigStyles.buttonSaveText]}>Grabar</Text>
          </TouchableOpacity>

          {saving ? (
            <ActivityIndicator style={[ConfigStyles.loader]} size="large" color="#00ff00" />
          ) : showText ? (
            <Text style={[ConfigStyles.messageStatus, darkMode && { color: "#E8F0F8" }]}>{showText}</Text>
          ) : (
            <View />
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
