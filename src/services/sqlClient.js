import Constants from "expo-constants";

const SQL_CONNECTOR_UNAVAILABLE_MESSAGE =
  "SQL directo requiere APK propia / development build. No funciona en Expo Go.";

const SQL_CONNECTOR_EXPO_GO_MESSAGE =
  "SQL directo requiere APK propia / development build. No funciona en Expo Go.";

const SQL_INSTANCE_NOT_SUPPORTED_MESSAGE =
  "Para SQL Server con instancia, configurá un puerto TCP fijo y usá IP,PUERTO. Ejemplo: 192.168.1.33,1433.";

const SQL_HOST_NOT_RESOLVED_MESSAGE =
  "No se pudo resolver el servidor SQL. Verificá la IP o nombre del servidor.";

const SQL_PORT_REFUSED_MESSAGE =
  "No se pudo conectar al puerto SQL. Verificá que TCP/IP esté habilitado en SQL Server, que el puerto esté abierto y que el firewall lo permita.";

const SQL_PORT_INVALID_MESSAGE = "El puerto SQL debe ser numérico.";
const SQL_HOST_EMPTY_MESSAGE = "Complete el servidor SQL.";

let MSSQL = null;
let loadAttempted = false;
let loadError = null;

const isExpoGo = () => Constants?.executionEnvironment === "storeClient";

const loadConnector = () => {
  if (loadAttempted) {
    return MSSQL;
  }

  loadAttempted = true;
  try {
    // Lazy load so Expo Go or unsupported environments do not fail at import time.
    // eslint-disable-next-line global-require
    MSSQL = require("react-native-mssql");
    loadError = null;
  } catch (error) {
    MSSQL = null;
    loadError = error;
  }

  return MSSQL;
};

const hasValidConnector = () => {
  if (isExpoGo()) {
    return false;
  }

  const connector = loadConnector();
  return Boolean(
    connector &&
      typeof connector.connect === "function" &&
      typeof connector.close === "function" &&
      typeof connector.executeQuery === "function",
  );
};

const isIntegerString = (value) => /^\d+$/.test(String(value ?? "").trim());

const parsePortValue = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return { port: null, invalid: false };
  }

  if (!isIntegerString(raw)) {
    return { port: null, invalid: true };
  }

  const port = parseInt(raw, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return { port: null, invalid: true };
  }

  return { port, invalid: false };
};

export const parseSqlServerAddress = (input) => {
  const raw = String(input ?? "").trim();

  if (!raw) {
    return {
      host: "",
      port: null,
      instance: null,
      separator: null,
      invalidPort: false,
      raw,
    };
  }

  const backslashIndex = raw.indexOf("\\");
  if (backslashIndex >= 0) {
    return {
      host: raw.slice(0, backslashIndex).trim(),
      port: null,
      instance: raw.slice(backslashIndex + 1).trim() || null,
      separator: "instance",
      invalidPort: false,
      raw,
    };
  }

  const commaIndex = raw.lastIndexOf(",");
  const colonIndex = raw.lastIndexOf(":");
  const separatorIndex = Math.max(commaIndex, colonIndex);
  if (separatorIndex >= 0) {
    const separator = raw[separatorIndex];
    const host = raw.slice(0, separatorIndex).trim();
    const portCandidate = raw.slice(separatorIndex + 1).trim();
    const parsedPort = parsePortValue(portCandidate);

    return {
      host,
      port: parsedPort.port,
      instance: null,
      separator: separator === "," ? "comma" : "colon",
      invalidPort: parsedPort.invalid,
      raw,
    };
  }

  return {
    host: raw,
    port: null,
    instance: null,
    separator: null,
    invalidPort: false,
    raw,
  };
};

const normalizeConnectionTarget = ({ server = "", port = "", instance = "" } = {}) => {
  const parsedServer = parseSqlServerAddress(server);
  const explicitInstance = String(instance ?? "").trim();
  const explicitPort = String(port ?? "").trim();
  const parsedExplicitPort = parsePortValue(explicitPort);

  if (!parsedServer.host) {
    throw new Error(SQL_HOST_EMPTY_MESSAGE);
  }

  if (parsedServer.invalidPort) {
    throw new Error(SQL_PORT_INVALID_MESSAGE);
  }

  const host = parsedServer.host.trim();
  const resolvedInstance = parsedServer.instance || explicitInstance || null;

  let resolvedPort = null;
  if (parsedServer.port !== null) {
    resolvedPort = parsedServer.port;
  } else if (explicitPort) {
    if (parsedExplicitPort.invalid) {
      throw new Error(SQL_PORT_INVALID_MESSAGE);
    }
    resolvedPort = parsedExplicitPort.port;
  }

  return {
    host,
    port: resolvedPort,
    instance: resolvedInstance,
  };
};

export const isSqlConnectorAvailable = () => hasValidConnector();

export const getSqlConnectorAvailabilityError = () => {
  if (isExpoGo()) {
    return SQL_CONNECTOR_EXPO_GO_MESSAGE;
  }

  if (loadError) {
    return SQL_CONNECTOR_UNAVAILABLE_MESSAGE;
  }

  return SQL_CONNECTOR_UNAVAILABLE_MESSAGE;
};

const normalizeSqlConnectionError = (error) => {
  const rawMessage = String(error?.message || error || "").trim();

  if (/Unknown server host name/i.test(rawMessage)) {
    return SQL_HOST_NOT_RESOLVED_MESSAGE;
  }

  if (/Connection refused/i.test(rawMessage)) {
    return SQL_PORT_REFUSED_MESSAGE;
  }

  if (/instance/i.test(rawMessage) && /not supported/i.test(rawMessage)) {
    return SQL_INSTANCE_NOT_SUPPORTED_MESSAGE;
  }

  return rawMessage || getSqlConnectorAvailabilityError();
};

export const connectSql = async (options = {}) => {
  if (!hasValidConnector()) {
    throw new Error(getSqlConnectorAvailabilityError());
  }

  const target = normalizeConnectionTarget(options);

  // Helpful debug trace for field parsing. Password is intentionally excluded.
  // eslint-disable-next-line no-console
  console.log("SQL parsed config:", {
    host: target.host,
    port: target.port ?? null,
    instance: target.instance ?? null,
    database: String(options.database ?? "").trim(),
    user: String(options.username ?? "").trim(),
  });

  try {
    return await MSSQL.connect({
      server: target.host,
      username: String(options.username ?? "").trim(),
      password: String(options.password ?? ""),
      database: String(options.database ?? "").trim(),
      port: target.port ?? undefined,
      instance: target.instance ?? undefined,
      timeout: options.timeout,
      trustServerCertificate: options.trustServerCertificate,
      encrypt: options.encrypt,
    });
  } catch (error) {
    throw new Error(normalizeSqlConnectionError(error));
  }
};

export const executeSql = async (query) => {
  if (!hasValidConnector()) {
    throw new Error(getSqlConnectorAvailabilityError());
  }

  return MSSQL.executeQuery(query);
};

export const closeSql = async () => {
  if (!hasValidConnector()) {
    return;
  }

  try {
    await MSSQL.close();
  } catch (e) {
    // ignore close errors
  }
};

export const resolveSqlConnectionTarget = normalizeConnectionTarget;
