import DatabaseLayer from "expo-sqlite-orm/src/DatabaseLayer";
import SQLite from "@db/SQLiteCompat";
import Configuration from "@db/Configuration";
import MSSQL from "react-native-mssql";

const DB_NAME = "alfadeposito.db";
const DEFAULT_BATCH_SIZE = 250;
const DEFAULT_TIMEOUT = 15;

let cachedConnectionKey = "";
let cachedConnectionPromise = null;

const normalizeMode = (value) => String(value ?? "").trim().toUpperCase();

const normalizeText = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const normalizeSearchText = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^0-9a-z]/gi, "")
    .toLowerCase();

const safeInt = (value, fallback = 0, min = 0, max = 2147483647) => {
  const parsed = parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const safeFloat = (value, fallback = 0) => {
  const parsed = parseFloat(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const stripIdentifier = (value) =>
  String(value ?? "")
    .trim()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/^"+/, "")
    .replace(/"+$/, "");

const quoteIdentifier = (value) => `[${stripIdentifier(value).replace(/\]/g, "]]")}]`;

const sqlLiteral = (value) => `'${String(value ?? "").replace(/'/g, "''")}'`;

const buildObjectName = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "[dbo].[Articulos]";
  }

  return raw
    .split(".")
    .map((part) => quoteIdentifier(part))
    .join(".");
};

const buildConnectionKey = (config) =>
  JSON.stringify({
    mode: config.mode,
    connectionMode: config.connectionMode,
    server: config.server,
    instance: config.instance,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    timeout: config.timeout,
  });

const buildTargetServer = (config) => {
  const rawServer = String(config.server ?? "").trim();
  const rawInstance = String(config.instance ?? "").trim();
  const rawPort = safeInt(config.port, 0, 0, 65535);
  const connectionMode = normalizeMode(config.connectionMode || "AUTO");

  if (!rawServer) {
    return { server: "", port: undefined };
  }

  if (rawServer.includes("\\") || rawServer.includes(",")) {
    const portFromRaw = rawServer.includes(",") ? safeInt(rawServer.split(",").slice(1).join(","), 0, 0, 65535) : 0;
    return {
      server: rawServer,
      port: portFromRaw > 0 ? portFromRaw : undefined,
    };
  }

  switch (connectionMode) {
    case "SERVER":
    case "IP":
      return {
        server: rawServer,
        port: rawPort > 0 ? rawPort : undefined,
      };
    case "INSTANCE":
      return {
        server: rawInstance ? `${rawServer}\\${rawInstance}` : rawServer,
        port: undefined,
      };
    case "PORT":
      return {
        server: rawServer,
        port: rawPort > 0 ? rawPort : undefined,
      };
    case "CUSTOM":
      return {
        server: rawServer,
        port: rawPort > 0 ? rawPort : undefined,
      };
    case "AUTO":
    default:
      if (rawInstance) {
        return { server: `${rawServer}\\${rawInstance}`, port: undefined };
      }
      if (rawPort > 0) {
        return { server: rawServer, port: rawPort };
      }
      return { server: rawServer, port: undefined };
  }
};

const getLocalDb = async () => SQLite.openDatabase(DB_NAME);

const ensureLocalCatalogSchema = async (tableName = "products") => {
  const db = await getLocalDb();
  const sql = `
    CREATE TABLE IF NOT EXISTS ${quoteIdentifier(tableName)} (
      id INTEGER PRIMARY KEY,
      code TEXT,
      codigoBarras TEXT,
      codigoBarra1 TEXT,
      codigoBarra2 TEXT,
      codigoBarra3 TEXT,
      codigoBarra4 TEXT,
      codigoBarraDun TEXT,
      name TEXT,
      category TEXT,
      family TEXT,
      iva NUMERIC,
      internal_taxes NUMERIC,
      cant_propuesta NUMERIC,
      exempt NUMERIC,
      price1 NUMERIC,
      price2 NUMERIC,
      price3 NUMERIC,
      price4 NUMERIC,
      price5 NUMERIC,
      price6 NUMERIC,
      price7 NUMERIC,
      price8 NUMERIC,
      price9 NUMERIC,
      price10 NUMERIC
    )
  `;
  await db.transaction((tx) => {
    tx.executeSql(sql, []);
  });
};

const clearLocalCatalog = async (tableName = "products") => {
  const db = await getLocalDb();
  await db.transaction((tx) => {
    tx.executeSql(`DELETE FROM ${quoteIdentifier(tableName)}`, []);
  });
};

const localProductsLayer = (tableName = "products") => new DatabaseLayer(async () => SQLite.openDatabase(DB_NAME), tableName);

const loadSqlConfig = async () => {
  await Configuration.createTable();
  return {
    mode: normalizeMode(await Configuration.getConfigValue("SQL_MODE") || "LOCAL"),
    connectionMode: normalizeMode(await Configuration.getConfigValue("SQL_CONNECTION_MODE") || "AUTO"),
    server: String(await Configuration.getConfigValue("SQL_SERVER") || "").trim(),
    instance: String(await Configuration.getConfigValue("SQL_INSTANCE") || "").trim(),
    port: safeInt(await Configuration.getConfigValue("SQL_PORT"), 0, 0, 65535),
    user: String(await Configuration.getConfigValue("SQL_USER") || "").trim(),
    password: String(await Configuration.getConfigValue("SQL_PASSWORD") || ""),
    database: String(await Configuration.getConfigValue("SQL_DATABASE") || "").trim(),
    objectName: String(await Configuration.getConfigValue("SQL_TABLE_VIEW") || "dbo.Articulos").trim(),
    timeout: safeInt(await Configuration.getConfigValue("SQL_TIMEOUT"), DEFAULT_TIMEOUT, 1, 120),
    batchSize: safeInt(await Configuration.getConfigValue("SQL_SYNC_BATCH_SIZE"), DEFAULT_BATCH_SIZE, 50, 2000),
  };
};

export const getCatalogConfig = loadSqlConfig;

export const isOnlineCatalogMode = async () => {
  const config = await loadSqlConfig();
  return config.mode === "ONLINE";
};

export const getCatalogConnectionTarget = async () => {
  const config = await loadSqlConfig();
  return buildTargetServer(config);
};

const connectSqlServer = async (config) => {
  const target = buildTargetServer(config);
  const connectionKey = buildConnectionKey({
    ...config,
    server: target.server,
    port: target.port,
  });

  if (cachedConnectionPromise && cachedConnectionKey === connectionKey) {
    return cachedConnectionPromise;
  }

  cachedConnectionKey = connectionKey;
  cachedConnectionPromise = (async () => {
    if (!target.server) {
      throw new Error("Falta configurar el servidor SQL.");
    }
    if (!config.database) {
      throw new Error("Falta configurar la base de datos SQL.");
    }
    if (!config.user) {
      throw new Error("Falta configurar el usuario SQL.");
    }

    await MSSQL.connect({
      server: target.server,
      username: config.user,
      password: config.password,
      database: config.database,
      port: target.port,
      timeout: safeInt(config.timeout, DEFAULT_TIMEOUT, 1, 120),
    });
    return true;
  })().catch((error) => {
    cachedConnectionKey = "";
    cachedConnectionPromise = null;
    throw error;
  });

  return cachedConnectionPromise;
};

export const closeSqlConnection = async () => {
  try {
    await MSSQL.close();
  } catch (e) {
    // ignore close errors to keep callers simple
  } finally {
    cachedConnectionKey = "";
    cachedConnectionPromise = null;
  }
};

const executeSqlServerQuery = async (query, config) => {
  await connectSqlServer(config);

  try {
    const result = await MSSQL.executeQuery(query);
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.rows)) return result.rows;
    if (Array.isArray(result?.recordset)) return result.recordset;
    return result?.rows?._array || [];
  } catch (error) {
    await closeSqlConnection();
    throw error;
  }
};

const buildCatalogColumns = (priceClass = 1) => {
  const safePriceClass = safeInt(priceClass, 1, 1, 10);
  return [
    "code",
    "codigoBarras",
    "codigoBarra1",
    "codigoBarra2",
    "codigoBarra3",
    "codigoBarra4",
    "codigoBarraDun",
    "name",
    "category",
    "family",
    "iva",
    "internal_taxes",
    "cant_propuesta",
    "exempt",
    "price1",
    "price2",
    "price3",
    "price4",
    "price5",
    "price6",
    "price7",
    "price8",
    "price9",
    "price10",
    `price${safePriceClass} AS priceSelected`,
  ].join(", ");
};

const buildLikeWhereClause = (searchText, params) => {
  const normalized = normalizeText(searchText);
  if (!normalized) {
    return "";
  }

  const like = sqlLiteral(`%${normalized}%`);
  const barcodeLike = sqlLiteral(`%${normalizeSearchText(searchText)}%`);

  return `
    WHERE (
      LOWER(LTRIM(RTRIM(ISNULL(name, '')))) LIKE ${like}
      OR LOWER(LTRIM(RTRIM(ISNULL(code, '')))) LIKE ${like}
      OR LOWER(LTRIM(RTRIM(ISNULL(category, '')))) LIKE ${like}
      OR LOWER(LTRIM(RTRIM(ISNULL(family, '')))) LIKE ${like}
      OR LOWER(LTRIM(RTRIM(ISNULL(codigoBarras, '')))) LIKE ${barcodeLike}
      OR LOWER(LTRIM(RTRIM(ISNULL(codigoBarra1, '')))) LIKE ${barcodeLike}
      OR LOWER(LTRIM(RTRIM(ISNULL(codigoBarra2, '')))) LIKE ${barcodeLike}
      OR LOWER(REPLACE(LTRIM(RTRIM(ISNULL(codigoBarra3, ''))), ' ', '')) LIKE ${barcodeLike}
      OR LOWER(REPLACE(LTRIM(RTRIM(ISNULL(codigoBarra4, ''))), ' ', '')) LIKE ${barcodeLike}
      OR LOWER(REPLACE(LTRIM(RTRIM(ISNULL(codigoBarraDun, ''))), ' ', '')) LIKE ${barcodeLike}
    )
  `;
};

const buildExactCodeWhereClause = (code) => {
  const normalized = normalizeSearchText(code);
  const raw = normalizeText(code);
  if (!normalized) {
    return "WHERE 1 = 0";
  }

  return `
    WHERE (
      LOWER(LTRIM(RTRIM(ISNULL(code, '')))) = ${sqlLiteral(raw)}
      OR LOWER(REPLACE(LTRIM(RTRIM(ISNULL(code, ''))), ' ', '')) = ${sqlLiteral(normalized)}
      OR LOWER(LTRIM(RTRIM(ISNULL(codigoBarras, '')))) = ${sqlLiteral(raw)}
      OR LOWER(REPLACE(LTRIM(RTRIM(ISNULL(codigoBarras, ''))), ' ', '')) = ${sqlLiteral(normalized)}
      OR LOWER(LTRIM(RTRIM(ISNULL(codigoBarra1, '')))) = ${sqlLiteral(raw)}
      OR LOWER(REPLACE(LTRIM(RTRIM(ISNULL(codigoBarra1, ''))), ' ', '')) = ${sqlLiteral(normalized)}
      OR LOWER(LTRIM(RTRIM(ISNULL(codigoBarra2, '')))) = ${sqlLiteral(raw)}
      OR LOWER(REPLACE(LTRIM(RTRIM(ISNULL(codigoBarra2, ''))), ' ', '')) = ${sqlLiteral(normalized)}
      OR LOWER(LTRIM(RTRIM(ISNULL(codigoBarra3, '')))) = ${sqlLiteral(raw)}
      OR LOWER(REPLACE(LTRIM(RTRIM(ISNULL(codigoBarra3, ''))), ' ', '')) = ${sqlLiteral(normalized)}
      OR LOWER(LTRIM(RTRIM(ISNULL(codigoBarra4, '')))) = ${sqlLiteral(raw)}
      OR LOWER(REPLACE(LTRIM(RTRIM(ISNULL(codigoBarra4, ''))), ' ', '')) = ${sqlLiteral(normalized)}
      OR LOWER(LTRIM(RTRIM(ISNULL(codigoBarraDun, '')))) = ${sqlLiteral(raw)}
      OR LOWER(REPLACE(LTRIM(RTRIM(ISNULL(codigoBarraDun, ''))), ' ', '')) = ${sqlLiteral(normalized)}
    )
  `;
};

const buildPrefixWhereClause = (code) => {
  const normalized = normalizeSearchText(code);
  if (!normalized) {
    return "WHERE 1 = 0";
  }

  return `
    WHERE (
      ${sqlLiteral(normalized)} LIKE REPLACE(LTRIM(RTRIM(ISNULL(code, ''))), ' ', '') + '%'
      OR ${sqlLiteral(normalized)} LIKE REPLACE(LTRIM(RTRIM(ISNULL(codigoBarras, ''))), ' ', '') + '%'
      OR ${sqlLiteral(normalized)} LIKE REPLACE(LTRIM(RTRIM(ISNULL(codigoBarra1, ''))), ' ', '') + '%'
      OR ${sqlLiteral(normalized)} LIKE REPLACE(LTRIM(RTRIM(ISNULL(codigoBarra2, ''))), ' ', '') + '%'
      OR ${sqlLiteral(normalized)} LIKE REPLACE(LTRIM(RTRIM(ISNULL(codigoBarra3, ''))), ' ', '') + '%'
      OR ${sqlLiteral(normalized)} LIKE REPLACE(LTRIM(RTRIM(ISNULL(codigoBarra4, ''))), ' ', '') + '%'
      OR ${sqlLiteral(normalized)} LIKE REPLACE(LTRIM(RTRIM(ISNULL(codigoBarraDun, ''))), ' ', '') + '%'
    )
  `;
};

const getRowPriceClass = (row, priceClass = 1) => {
  const safePriceClass = safeInt(priceClass, 1, 1, 10);
  const priceKey = `price${safePriceClass}`;
  return {
    ...row,
    id: row?.id ?? row?.ID ?? row?.Id ?? row?.code ?? row?.Code ?? row?.codigoBarras ?? row?.CodigoBarras ?? 0,
    code: row?.code ?? row?.Code ?? "",
    codigoBarras: row?.codigoBarras ?? row?.CodigoBarras ?? "",
    codigoBarra1: row?.codigoBarra1 ?? row?.CodigoBarra1 ?? "",
    codigoBarra2: row?.codigoBarra2 ?? row?.CodigoBarra2 ?? "",
    codigoBarra3: row?.codigoBarra3 ?? row?.CodigoBarra3 ?? "",
    codigoBarra4: row?.codigoBarra4 ?? row?.CodigoBarra4 ?? "",
    codigoBarraDun: row?.codigoBarraDun ?? row?.CodigoBarraDun ?? "",
    name: row?.name ?? row?.Name ?? "",
    category: row?.category ?? row?.Category ?? "",
    family: row?.family ?? row?.Family ?? "",
    iva: safeFloat(row?.iva ?? row?.Iva, 0),
    internal_taxes: safeFloat(row?.internal_taxes ?? row?.internalTaxes, 0),
    cant_propuesta: safeFloat(row?.cant_propuesta ?? row?.cantPropuesta, 0),
    exempt: safeFloat(row?.exempt, 0),
    price1: safeFloat(row?.price1 ?? row?.Price1 ?? row?.priceSelected ?? row?.Precio1, 0),
    price2: safeFloat(row?.price2 ?? row?.Price2 ?? row?.Precio2, 0),
    price3: safeFloat(row?.price3 ?? row?.Price3 ?? row?.Precio3, 0),
    price4: safeFloat(row?.price4 ?? row?.Price4 ?? row?.Precio4, 0),
    price5: safeFloat(row?.price5 ?? row?.Price5 ?? row?.Precio5, 0),
    price6: safeFloat(row?.price6 ?? row?.Price6 ?? row?.Precio6, 0),
    price7: safeFloat(row?.price7 ?? row?.Price7 ?? row?.Precio7, 0),
    price8: safeFloat(row?.price8 ?? row?.Price8 ?? row?.Precio8, 0),
    price9: safeFloat(row?.price9 ?? row?.Price9 ?? row?.Precio9, 0),
    price10: safeFloat(row?.price10 ?? row?.Price10 ?? row?.Precio10, 0),
    [priceKey]: safeFloat(row?.[priceKey] ?? row?.priceSelected, 0),
  };
};

const buildPagedQuery = (config, { searchText = "", limit = 50, page = 1, priceClass = 1, exact = false, prefix = false }) => {
  const safeLimit = safeInt(limit, 50, 1, 5000);
  const safePage = safeInt(page, 1, 1, 100000);
  const safeOffset = (safePage - 1) * safeLimit;
  const objectName = buildObjectName(config.objectName);
  const whereClause = exact
    ? buildExactCodeWhereClause(searchText)
    : prefix
      ? buildPrefixWhereClause(searchText)
      : buildLikeWhereClause(searchText);
  const orderBy = "ORDER BY LOWER(LTRIM(RTRIM(ISNULL(name, '')))), LOWER(LTRIM(RTRIM(ISNULL(code, ''))))";
  const selectColumns = buildCatalogColumns(priceClass);
  const numberedColumns = `ROW_NUMBER() OVER (${orderBy}) AS id, ${selectColumns}`;

  if (safeOffset > 0) {
    const rowRangeStart = safeOffset + 1;
    const rowRangeEnd = safeOffset + safeLimit;
    return {
      query: `
        SELECT id, ${selectColumns}
        FROM (
          SELECT ${numberedColumns}
          FROM ${objectName}
          ${whereClause}
        ) AS catalog
        WHERE id BETWEEN ${rowRangeStart} AND ${rowRangeEnd}
        ORDER BY id
      `,
    };
  }

  return {
    query: `
      SELECT TOP ${safeLimit} ${numberedColumns}
      FROM ${objectName}
      ${whereClause}
      ${orderBy}
    `,
  };
};

export const queryCatalogPage = async ({ searchText = "", limit = 50, page = 1, priceClass = 1 } = {}) => {
  const config = await loadSqlConfig();
  if (config.mode !== "ONLINE") {
    throw new Error("La consulta remota solo está disponible en modo SQL Online.");
  }

  const { query } = buildPagedQuery(config, { searchText, limit, page, priceClass });
  const rows = await executeSqlServerQuery(query, config);
  return rows.map((row) => getRowPriceClass(row, priceClass));
};

export const findCatalogLikeName = async ({ name = "", classPrice = 1, limit = 20, page = 1 } = {}) => {
  return queryCatalogPage({ searchText: name, limit, page, priceClass: classPrice });
};

export const findCatalogByCode = async ({ code = "", classPrice = 1 } = {}) => {
  const config = await loadSqlConfig();
  if (config.mode !== "ONLINE") {
    throw new Error("La consulta remota solo está disponible en modo SQL Online.");
  }

  const { query } = buildPagedQuery(config, {
    searchText: code,
    limit: 1,
    page: 1,
    priceClass: classPrice,
    exact: true,
  });
  const rows = await executeSqlServerQuery(query, config);
  return rows.map((row) => getRowPriceClass(row, classPrice));
};

export const findCatalogByCodes = async ({ codes = [], classPrice = 1 } = {}) => {
  const uniqueCodes = Array.from(
    new Set(
      (codes || [])
        .map((code) => String(code ?? "").trim())
        .filter(Boolean)
    )
  );

  if (uniqueCodes.length === 0) {
    return [];
  }

  const config = await loadSqlConfig();
  if (config.mode !== "ONLINE") {
    throw new Error("La consulta remota solo está disponible en modo SQL Online.");
  }

  const normalizedInClause = uniqueCodes.map((code) => sqlLiteral(normalizeSearchText(code))).join(",");
  const quotedCodes = uniqueCodes.map((code) => sqlLiteral(code)).join(",");
  const objectName = buildObjectName(config.objectName);

  const query = `
    SELECT ROW_NUMBER() OVER (ORDER BY LOWER(LTRIM(RTRIM(ISNULL(name, '')))), LOWER(LTRIM(RTRIM(ISNULL(code, ''))))) AS id, ${buildCatalogColumns(classPrice)}
    FROM ${objectName}
    WHERE (
      LTRIM(RTRIM(ISNULL(code, ''))) IN (${quotedCodes})
      OR REPLACE(LTRIM(RTRIM(ISNULL(code, ''))), ' ', '') IN (${normalizedInClause})
      OR LTRIM(RTRIM(ISNULL(codigoBarras, ''))) IN (${quotedCodes})
      OR REPLACE(LTRIM(RTRIM(ISNULL(codigoBarras, ''))), ' ', '') IN (${normalizedInClause})
      OR LTRIM(RTRIM(ISNULL(codigoBarra1, ''))) IN (${quotedCodes})
      OR REPLACE(LTRIM(RTRIM(ISNULL(codigoBarra1, ''))), ' ', '') IN (${normalizedInClause})
      OR LTRIM(RTRIM(ISNULL(codigoBarra2, ''))) IN (${quotedCodes})
      OR REPLACE(LTRIM(RTRIM(ISNULL(codigoBarra2, ''))), ' ', '') IN (${normalizedInClause})
      OR LTRIM(RTRIM(ISNULL(codigoBarra3, ''))) IN (${quotedCodes})
      OR REPLACE(LTRIM(RTRIM(ISNULL(codigoBarra3, ''))), ' ', '') IN (${normalizedInClause})
      OR LTRIM(RTRIM(ISNULL(codigoBarra4, ''))) IN (${quotedCodes})
      OR REPLACE(LTRIM(RTRIM(ISNULL(codigoBarra4, ''))), ' ', '') IN (${normalizedInClause})
      OR LTRIM(RTRIM(ISNULL(codigoBarraDun, ''))) IN (${quotedCodes})
      OR REPLACE(LTRIM(RTRIM(ISNULL(codigoBarraDun, ''))), ' ', '') IN (${normalizedInClause})
    )
  `;

  const rows = await executeSqlServerQuery(query, config);
  return rows.map((row) => getRowPriceClass(row, classPrice));
};

export const findCatalogByBarcodePrefix = async ({ scannedCode = "", classPrice = 1 } = {}) => {
  const config = await loadSqlConfig();
  if (config.mode !== "ONLINE") {
    throw new Error("La consulta remota solo está disponible en modo SQL Online.");
  }

  const normalized = normalizeSearchText(scannedCode);
  if (!normalized) {
    return [];
  }

  const objectName = buildObjectName(config.objectName);
  const query = `
    SELECT TOP 50 ROW_NUMBER() OVER (ORDER BY LOWER(LTRIM(RTRIM(ISNULL(name, '')))), LOWER(LTRIM(RTRIM(ISNULL(code, ''))))) AS id, ${buildCatalogColumns(classPrice)}
    FROM ${objectName}
    WHERE (
      '${normalized}' LIKE REPLACE(LTRIM(RTRIM(ISNULL(code, ''))), ' ', '') + '%'
      OR '${normalized}' LIKE REPLACE(LTRIM(RTRIM(ISNULL(codigoBarras, ''))), ' ', '') + '%'
      OR '${normalized}' LIKE REPLACE(LTRIM(RTRIM(ISNULL(codigoBarra1, ''))), ' ', '') + '%'
      OR '${normalized}' LIKE REPLACE(LTRIM(RTRIM(ISNULL(codigoBarra2, ''))), ' ', '') + '%'
      OR '${normalized}' LIKE REPLACE(LTRIM(RTRIM(ISNULL(codigoBarra3, ''))), ' ', '') + '%'
      OR '${normalized}' LIKE REPLACE(LTRIM(RTRIM(ISNULL(codigoBarra4, ''))), ' ', '') + '%'
      OR '${normalized}' LIKE REPLACE(LTRIM(RTRIM(ISNULL(codigoBarraDun, ''))), ' ', '') + '%'
    )
  `;

  const rows = await executeSqlServerQuery(query, config);
  return rows.map((row) => getRowPriceClass(row, classPrice));
};

export const syncCatalogToLocal = async ({ onProgress } = {}) => {
  const config = await loadSqlConfig();
  if (config.mode !== "LOCAL") {
    throw new Error("La sincronización local solo aplica cuando SQL_MODE está en SQL Local.");
  }

  const stagingTable = "products_sync_stage";
  await ensureLocalCatalogSchema();
  await ensureLocalCatalogSchema(stagingTable);
  await clearLocalCatalog(stagingTable);

  const sourceConfig = { ...config, mode: "ONLINE" };
  let page = 1;
  let inserted = 0;
  const priceClass = 1;

  while (true) {
    const { query } = buildPagedQuery(sourceConfig, {
      searchText: "",
      limit: config.batchSize,
      page,
      priceClass,
    });

    const rows = await executeSqlServerQuery(query, config);
    const mappedRows = rows.map((row) => ({
      id: safeInt(row?.id, 0, 0, 2147483647) || null,
      code: String(row?.code ?? "").trim(),
      codigoBarras: String(row?.codigoBarras ?? "").trim(),
      codigoBarra1: String(row?.codigoBarra1 ?? "").trim(),
      codigoBarra2: String(row?.codigoBarra2 ?? "").trim(),
      codigoBarra3: String(row?.codigoBarra3 ?? "").trim(),
      codigoBarra4: String(row?.codigoBarra4 ?? "").trim(),
      codigoBarraDun: String(row?.codigoBarraDun ?? "").trim(),
      name: String(row?.name ?? "").trim(),
      category: String(row?.category ?? "").trim(),
      family: String(row?.family ?? "").trim(),
      iva: safeFloat(row?.iva, 0),
      internal_taxes: safeFloat(row?.internal_taxes, 0),
      cant_propuesta: safeFloat(row?.cant_propuesta, 0),
      exempt: safeFloat(row?.exempt, 0),
      price1: safeFloat(row?.price1, 0),
      price2: safeFloat(row?.price2, 0),
      price3: safeFloat(row?.price3, 0),
      price4: safeFloat(row?.price4, 0),
      price5: safeFloat(row?.price5, 0),
      price6: safeFloat(row?.price6, 0),
      price7: safeFloat(row?.price7, 0),
      price8: safeFloat(row?.price8, 0),
      price9: safeFloat(row?.price9, 0),
      price10: safeFloat(row?.price10, 0),
    }));

    if (mappedRows.length === 0) {
      break;
    }

    await localProductsLayer(stagingTable).bulkInsertOrReplace(mappedRows);
    inserted += mappedRows.length;

    if (typeof onProgress === "function") {
      onProgress({
        inserted,
        page,
        batchSize: config.batchSize,
        done: mappedRows.length < config.batchSize,
      });
    }

    if (mappedRows.length < config.batchSize) {
      break;
    }

    page += 1;
  }

  const db = await getLocalDb();
  await db.transaction((tx) => {
    tx.executeSql(`DELETE FROM ${quoteIdentifier("products")}`, []);
    tx.executeSql(
      `
        INSERT INTO ${quoteIdentifier("products")} (
          id, code, codigoBarras, codigoBarra1, codigoBarra2, codigoBarra3, codigoBarra4, codigoBarraDun,
          name, category, family, iva, internal_taxes, cant_propuesta, exempt,
          price1, price2, price3, price4, price5, price6, price7, price8, price9, price10
        )
        SELECT
          id, code, codigoBarras, codigoBarra1, codigoBarra2, codigoBarra3, codigoBarra4, codigoBarraDun,
          name, category, family, iva, internal_taxes, cant_propuesta, exempt,
          price1, price2, price3, price4, price5, price6, price7, price8, price9, price10
        FROM ${quoteIdentifier(stagingTable)}
      `,
      []
    );
    tx.executeSql(`DELETE FROM ${quoteIdentifier(stagingTable)}`, []);
  });

  return {
    inserted,
    mode: config.mode,
    server: buildTargetServer(config).server,
    objectName: config.objectName,
  };
};

export const readCatalogConfigSummary = async () => {
  const config = await loadSqlConfig();
  const target = buildTargetServer(config);
  return {
    mode: config.mode,
    connectionMode: config.connectionMode,
    server: target.server,
    port: target.port,
    database: config.database,
    objectName: config.objectName,
    timeout: config.timeout,
  };
};

const CatalogService = {
  getCatalogConfig,
  isOnlineCatalogMode,
  getCatalogConnectionTarget,
  closeSqlConnection,
  queryCatalogPage,
  findCatalogLikeName,
  findCatalogByCode,
  findCatalogByCodes,
  findCatalogByBarcodePrefix,
  syncCatalogToLocal,
  readCatalogConfigSummary,
};

export default CatalogService;
