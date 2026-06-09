import DatabaseLayer from "expo-sqlite-orm/src/DatabaseLayer";
import SQLite from "@db/SQLiteCompat";
import Configuration from "@db/Configuration";
import {
  closeSql,
  connectSql,
  executeSql,
  getSqlConnectorAvailabilityError,
  isSqlConnectorAvailable,
  parseSqlServerAddress,
  resolveSqlConnectionTarget,
} from "@services/sqlClient";

const DB_NAME = "AlfaScan.db";
const DEFAULT_BATCH_SIZE = 250;
const DEFAULT_TIMEOUT = 15;

let cachedConnectionKey = "";
let cachedConnectionPromise = null;

const normalizeMode = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

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

const parseOptionalPort = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    return null;
  }

  return parsed;
};

const safeFloat = (value, fallback = 0) => {
  const parsed = parseFloat(
    String(value ?? "")
      .trim()
      .replace(",", "."),
  );
  return Number.isFinite(parsed) ? parsed : fallback;
};

const stripIdentifier = (value) =>
  String(value ?? "")
    .trim()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/^"+/, "")
    .replace(/"+$/, "");

const quoteIdentifier = (value) =>
  `[${stripIdentifier(value).replace(/\]/g, "]]")}]`;

const sqlLiteral = (value) => `'${String(value ?? "").replace(/'/g, "''")}'`;

const normalizeConfiguredField = (value, fallback) =>
  String(value ?? "").trim() || fallback;

const buildFieldReference = (value, fallback) =>
  quoteIdentifier(normalizeConfiguredField(value, fallback));

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
  const parsedServer = rawServer ? parseSqlServerAddress(rawServer) : null;

  if (!parsedServer || !parsedServer.host) {
    return { host: "", port: null, instance: null };
  }

  const explicitPort = safeInt(config.port, 0, 0, 65535);
  const explicitInstance = String(config.instance ?? "").trim();

  if (parsedServer.instance) {
    return {
      host: parsedServer.host,
      port: null,
      instance: parsedServer.instance,
    };
  }

  if (parsedServer.port !== null) {
    return {
      host: parsedServer.host,
      port: parsedServer.port,
      instance: null,
    };
  }

  if (explicitInstance) {
    return {
      host: parsedServer.host,
      port: null,
      instance: explicitInstance,
    };
  }

  if (explicitPort > 0) {
    return {
      host: parsedServer.host,
      port: explicitPort,
      instance: null,
    };
  }

  return {
    host: parsedServer.host,
    port: null,
    instance: null,
  };
};

const getLocalDb = async () => SQLite.openDatabase(DB_NAME);

const ensureLocalCatalogSchema = async (tableName = "products") => {
  const db = await getLocalDb();
  const sql = `
    CREATE TABLE IF NOT EXISTS ${quoteIdentifier(tableName)} (
      id INTEGER PRIMARY KEY,
      code TEXT,
      codigoArticulo TEXT,
      codigoBarras TEXT,
      codigoBarra TEXT,
      codigoBarra1 TEXT,
      codigoBarra2 TEXT,
      codigoBarra3 TEXT,
      codigoBarra4 TEXT,
      codigoBarraDun TEXT,
      name TEXT,
      descripcion TEXT,
      category TEXT,
      family TEXT,
      iva NUMERIC,
      internal_taxes NUMERIC,
      cant_propuesta NUMERIC,
      exempt NUMERIC,
      precio NUMERIC,
      stock NUMERIC,
      fechaActualizacion TEXT,
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
    const extraColumns = [
      "codigoArticulo TEXT",
      "codigoBarra TEXT",
      "descripcion TEXT",
      "precio NUMERIC",
      "stock NUMERIC",
      "fechaActualizacion TEXT",
    ];

    for (const column of extraColumns) {
      const [columnName, columnType] = column.split(" ");
      tx.executeSql(
        `ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${columnName} ${columnType}`,
        [],
        () => {},
        () => true,
      );
    }
  });
};

const clearLocalCatalog = async (tableName = "products") => {
  const db = await getLocalDb();
  await db.transaction((tx) => {
    tx.executeSql(`DELETE FROM ${quoteIdentifier(tableName)}`, []);
  });
};

const localProductsLayer = (tableName = "products") =>
  new DatabaseLayer(async () => SQLite.openDatabase(DB_NAME), tableName);

const loadSqlConfig = async () => {
  await Configuration.createTable();
  return {
    mode: normalizeMode(
      (await Configuration.getConfigValue("SQL_MODE")) || "LOCAL",
    ),
    connectionMode: normalizeMode(
      (await Configuration.getConfigValue("SQL_CONNECTION_MODE")) || "AUTO",
    ),
    server: String(
      (await Configuration.getConfigValue("SQL_SERVER")) || "",
    ).trim(),
    instance: String(
      (await Configuration.getConfigValue("SQL_INSTANCE")) || "",
    ).trim(),
    port: parseOptionalPort(await Configuration.getConfigValue("SQL_PORT")),
    user: String((await Configuration.getConfigValue("SQL_USER")) || "").trim(),
    password: String(
      (await Configuration.getConfigValue("SQL_PASSWORD")) || "",
    ),
    database: String(
      (await Configuration.getConfigValue("SQL_DATABASE")) || "",
    ).trim(),
    objectName: String(
      (await Configuration.getConfigValue("SQL_ARTICLES_TABLE")) ||
        (await Configuration.getConfigValue("SQL_TABLE_VIEW")) ||
        "Productos",
    ).trim(),
    codeField: normalizeConfiguredField(
      (await Configuration.getConfigValue("SQL_CODE_FIELD")) ||
        (await Configuration.getConfigValue("SQL_ARTICLE_CODE_FIELD")) ||
        "CodigoArticulo",
      "CodigoArticulo",
    ),
    barcodeField: normalizeConfiguredField(
      (await Configuration.getConfigValue("SQL_BARCODE_FIELD")) ||
        (await Configuration.getConfigValue("SQL_CODE_BAR_FIELD")) ||
        "CodigoBarra",
      "CodigoBarra",
    ),
    descriptionField: normalizeConfiguredField(
      (await Configuration.getConfigValue("SQL_DESCRIPTION_FIELD")) ||
        "Descripcion",
      "Descripcion",
    ),
    priceField: normalizeConfiguredField(
      (await Configuration.getConfigValue("SQL_PRICE_FIELD")) || "Precio",
      "Precio",
    ),
    stockField: normalizeConfiguredField(
      (await Configuration.getConfigValue("SQL_STOCK_FIELD")) || "Stock",
      "Stock",
    ),
    useStockColumn: Configuration.isTruthyConfigValue(
      (await Configuration.getConfigValue("SQL_USE_STOCK_COLUMN")) ||
        (await Configuration.getConfigValue("SQL_USE_STOCK")),
    ),
    timeout: safeInt(
      await Configuration.getConfigValue("SQL_TIMEOUT"),
      DEFAULT_TIMEOUT,
      1,
      120,
    ),
    batchSize: safeInt(
      await Configuration.getConfigValue("SQL_SYNC_BATCH_SIZE"),
      DEFAULT_BATCH_SIZE,
      50,
      2000,
    ),
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
  const target = resolveSqlConnectionTarget({
    server: config.server,
    port: config.port,
    instance: config.instance,
  });
  const connectionKey = buildConnectionKey({
    ...config,
    server: target.host,
    port: target.port,
    instance: target.instance,
  });

  if (cachedConnectionPromise && cachedConnectionKey === connectionKey) {
    return cachedConnectionPromise;
  }

  cachedConnectionKey = connectionKey;
  cachedConnectionPromise = (async () => {
    if (!isSqlConnectorAvailable()) {
      throw new Error(getSqlConnectorAvailabilityError());
    }
    if (!target.host) {
      throw new Error("Falta configurar el servidor SQL.");
    }
    if (!config.database) {
      throw new Error("Falta configurar la base de datos SQL.");
    }
    if (!config.user) {
      throw new Error("Falta configurar el usuario SQL.");
    }

    await connectSql({
      server: target.host,
      username: config.user,
      password: config.password,
      database: config.database,
      port: target.port,
      instance: target.instance,
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
    await closeSql();
  } finally {
    cachedConnectionKey = "";
    cachedConnectionPromise = null;
  }
};

const executeSqlServerQuery = async (query, config) => {
  await connectSqlServer(config);

  try {
    const result = await executeSql(query);
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.rows)) return result.rows;
    if (Array.isArray(result?.recordset)) return result.recordset;
    return result?.rows?._array || [];
  } catch (error) {
    await closeSqlConnection();
    throw error;
  }
};

const buildCatalogColumns = (config) => {
  const codeField = buildFieldReference(config.codeField, "CodigoArticulo");
  const barcodeField = buildFieldReference(config.barcodeField, "CodigoBarra");
  const descriptionField = buildFieldReference(
    config.descriptionField,
    "Descripcion",
  );
  const priceField = buildFieldReference(config.priceField, "Precio");
  const stockField = buildFieldReference(config.stockField, "Stock");
  const stockColumn = config.useStockColumn
    ? `${stockField} AS stock`
    : "CAST(NULL AS NUMERIC(18,2)) AS stock";
  return [
    `${codeField} AS code`,
    `${codeField} AS codigoArticulo`,
    `${barcodeField} AS codigoBarras`,
    `${barcodeField} AS codigoBarra`,
    `${descriptionField} AS name`,
    `${descriptionField} AS descripcion`,
    `${priceField} AS precio`,
    stockColumn,
    "CONVERT(NVARCHAR(30), GETDATE(), 126) AS fechaActualizacion",
    `CAST(ISNULL(${priceField}, 0) AS NUMERIC(18,2)) AS price1`,
    "CAST(0 AS NUMERIC(18,2)) AS price2",
    "CAST(0 AS NUMERIC(18,2)) AS price3",
    "CAST(0 AS NUMERIC(18,2)) AS price4",
    "CAST(0 AS NUMERIC(18,2)) AS price5",
    "CAST(0 AS NUMERIC(18,2)) AS price6",
    "CAST(0 AS NUMERIC(18,2)) AS price7",
    "CAST(0 AS NUMERIC(18,2)) AS price8",
    "CAST(0 AS NUMERIC(18,2)) AS price9",
    "CAST(0 AS NUMERIC(18,2)) AS price10",
    `CAST(ISNULL(${priceField}, 0) AS NUMERIC(18,2)) AS priceSelected`,
    "CAST(NULL AS NVARCHAR(100)) AS codigoBarra1",
    "CAST(NULL AS NVARCHAR(100)) AS codigoBarra2",
    "CAST(NULL AS NVARCHAR(100)) AS codigoBarra3",
    "CAST(NULL AS NVARCHAR(100)) AS codigoBarra4",
    "CAST(NULL AS NVARCHAR(100)) AS codigoBarraDun",
    "CAST(NULL AS NVARCHAR(100)) AS category",
    "CAST(NULL AS NVARCHAR(100)) AS family",
    "CAST(0 AS NUMERIC(18,2)) AS iva",
    "CAST(0 AS NUMERIC(18,2)) AS internal_taxes",
    "CAST(0 AS NUMERIC(18,2)) AS cant_propuesta",
    "CAST(0 AS NUMERIC(18,2)) AS exempt",
  ].join(", ");
};

const buildLikeWhereClause = (config, searchText) => {
  const normalized = normalizeText(searchText);
  if (!normalized) {
    return "";
  }

  const like = sqlLiteral(`%${normalized}%`);
  const barcodeLike = sqlLiteral(`%${normalizeSearchText(searchText)}%`);
  const codeField = buildFieldReference(config.codeField, "CodigoArticulo");
  const barcodeField = buildFieldReference(config.barcodeField, "CodigoBarra");
  const descriptionField = buildFieldReference(
    config.descriptionField,
    "Descripcion",
  );

  return `
    WHERE (
      LOWER(LTRIM(RTRIM(ISNULL(${descriptionField}, '')))) LIKE ${like}
      OR LOWER(LTRIM(RTRIM(ISNULL(${codeField}, '')))) LIKE ${like}
      OR LOWER(LTRIM(RTRIM(ISNULL(${barcodeField}, '')))) LIKE ${barcodeLike}
    )
  `;
};

const buildExactCodeWhereClause = (config, code) => {
  const normalized = normalizeSearchText(code);
  const raw = normalizeText(code);
  if (!normalized) {
    return "WHERE 1 = 0";
  }

  const codeField = buildFieldReference(config.codeField, "CodigoArticulo");
  const barcodeField = buildFieldReference(config.barcodeField, "CodigoBarra");

  return `
    WHERE (
      LOWER(LTRIM(RTRIM(ISNULL(${codeField}, '')))) = ${sqlLiteral(raw)}
      OR LOWER(REPLACE(LTRIM(RTRIM(ISNULL(${codeField}, ''))), ' ', '')) = ${sqlLiteral(normalized)}
      OR LOWER(LTRIM(RTRIM(ISNULL(${barcodeField}, '')))) = ${sqlLiteral(raw)}
      OR LOWER(REPLACE(LTRIM(RTRIM(ISNULL(${barcodeField}, ''))), ' ', '')) = ${sqlLiteral(normalized)}
    )
  `;
};

const buildPrefixWhereClause = (config, code) => {
  const normalized = normalizeSearchText(code);
  if (!normalized) {
    return "WHERE 1 = 0";
  }

  const codeField = buildFieldReference(config.codeField, "CodigoArticulo");
  const barcodeField = buildFieldReference(config.barcodeField, "CodigoBarra");

  return `
    WHERE (
      ${sqlLiteral(normalized)} LIKE REPLACE(LTRIM(RTRIM(ISNULL(${codeField}, ''))), ' ', '') + '%'
      OR ${sqlLiteral(normalized)} LIKE REPLACE(LTRIM(RTRIM(ISNULL(${barcodeField}, ''))), ' ', '') + '%'
    )
  `;
};

const getRowPriceClass = (row, priceClass = 1, useStockColumn = true) => {
  const safePriceClass = safeInt(priceClass, 1, 1, 10);
  const priceKey = `price${safePriceClass}`;
  return {
    ...row,
    id:
      row?.id ??
      row?.ID ??
      row?.Id ??
      row?.code ??
      row?.Code ??
      row?.codigoBarras ??
      row?.CodigoBarras ??
      0,
    code: row?.code ?? row?.Code ?? "",
    codigoArticulo:
      row?.codigoArticulo ?? row?.CodigoArticulo ?? row?.code ?? "",
    codigoBarras: row?.codigoBarras ?? row?.CodigoBarras ?? "",
    codigoBarra:
      row?.codigoBarra ?? row?.CodigoBarra ?? row?.codigoBarras ?? "",
    codigoBarra1: row?.codigoBarra1 ?? row?.CodigoBarra1 ?? "",
    codigoBarra2: row?.codigoBarra2 ?? row?.CodigoBarra2 ?? "",
    codigoBarra3: row?.codigoBarra3 ?? row?.CodigoBarra3 ?? "",
    codigoBarra4: row?.codigoBarra4 ?? row?.CodigoBarra4 ?? "",
    codigoBarraDun: row?.codigoBarraDun ?? row?.CodigoBarraDun ?? "",
    name: row?.name ?? row?.Name ?? "",
    descripcion: row?.descripcion ?? row?.Descripcion ?? row?.name ?? "",
    category: row?.category ?? row?.Category ?? "",
    family: row?.family ?? row?.Family ?? "",
    iva: safeFloat(row?.iva ?? row?.Iva, 0),
    internal_taxes: safeFloat(row?.internal_taxes ?? row?.internalTaxes, 0),
    cant_propuesta: safeFloat(row?.cant_propuesta ?? row?.cantPropuesta, 0),
    exempt: safeFloat(row?.exempt, 0),
    precio: safeFloat(row?.precio ?? row?.Precio ?? row?.price1, 0),
    stock: useStockColumn ? safeFloat(row?.stock ?? row?.Stock, 0) : null,
    fechaActualizacion:
      row?.fechaActualizacion ??
      row?.FechaActualizacion ??
      row?.updated_at ??
      row?.updatedAt ??
      "",
    price1: safeFloat(
      row?.price1 ?? row?.Price1 ?? row?.priceSelected ?? row?.Precio1,
      0,
    ),
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

const buildPagedQuery = (
  config,
  {
    searchText = "",
    limit = 50,
    page = 1,
    priceClass = 1,
    exact = false,
    prefix = false,
  },
) => {
  const safeLimit = safeInt(limit, 50, 1, 5000);
  const safePage = safeInt(page, 1, 1, 100000);
  const safeOffset = (safePage - 1) * safeLimit;
  const objectName = buildObjectName(config.objectName);
  const whereClause = exact
    ? buildExactCodeWhereClause(config, searchText)
    : prefix
      ? buildPrefixWhereClause(config, searchText)
      : buildLikeWhereClause(config, searchText);
  const orderBy = `ORDER BY LOWER(LTRIM(RTRIM(ISNULL(${buildFieldReference(config.descriptionField, "Descripcion")}, '')))), LOWER(LTRIM(RTRIM(ISNULL(${buildFieldReference(config.codeField, "CodigoArticulo")}, ''))))`;
  const selectColumns = buildCatalogColumns(config);
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

export const queryCatalogPage = async ({
  searchText = "",
  limit = 50,
  page = 1,
  priceClass = 1,
} = {}) => {
  const config = await loadSqlConfig();
  if (config.mode !== "ONLINE") {
    throw new Error(
      "La consulta remota solo está disponible en modo SQL Online.",
    );
  }

  const { query } = buildPagedQuery(config, {
    searchText,
    limit,
    page,
    priceClass,
  });
  const rows = await executeSqlServerQuery(query, config);
  return rows.map((row) => getRowPriceClass(row, priceClass, config.useStockColumn));
};

export const findCatalogLikeName = async ({
  name = "",
  classPrice = 1,
  limit = 20,
  page = 1,
} = {}) => {
  return queryCatalogPage({
    searchText: name,
    limit,
    page,
    priceClass: classPrice,
  });
};

export const findCatalogByCode = async ({ code = "", classPrice = 1 } = {}) => {
  const config = await loadSqlConfig();
  if (config.mode !== "ONLINE") {
    throw new Error(
      "La consulta remota solo está disponible en modo SQL Online.",
    );
  }

  const { query } = buildPagedQuery(config, {
    searchText: code,
    limit: 1,
    page: 1,
    priceClass: classPrice,
    exact: true,
  });
  const rows = await executeSqlServerQuery(query, config);
  return rows.map((row) => getRowPriceClass(row, classPrice, config.useStockColumn));
};

export const findCatalogByBarcodeExact = async ({ barcode = "", classPrice = 1 } = {}) => {
  const config = await loadSqlConfig();
  if (config.mode !== "ONLINE") {
    throw new Error(
      "La consulta remota solo estÃ¡ disponible en modo SQL Online.",
    );
  }

  const normalized = normalizeSearchText(barcode);
  const raw = normalizeText(barcode);
  if (!normalized && !raw) {
    return [];
  }

  const objectName = buildObjectName(config.objectName);
  const barcodeField = buildFieldReference(config.barcodeField, "CodigoBarra");
  const selectColumns = buildCatalogColumns(config);
  const query = `
    SELECT ROW_NUMBER() OVER (ORDER BY LOWER(LTRIM(RTRIM(ISNULL(${buildFieldReference(config.descriptionField, "Descripcion")}, '')))), LOWER(LTRIM(RTRIM(ISNULL(${buildFieldReference(config.codeField, "CodigoArticulo")}, ''))))) AS id, ${selectColumns}
    FROM ${objectName}
    WHERE (
      LTRIM(RTRIM(ISNULL(${barcodeField}, ''))) = ${sqlLiteral(raw)}
      OR REPLACE(LTRIM(RTRIM(ISNULL(${barcodeField}, ''))), ' ', '') = ${sqlLiteral(normalized)}
    )
  `;

  const rows = await executeSqlServerQuery(query, config);
  return rows.map((row) => getRowPriceClass(row, classPrice, config.useStockColumn));
};

const getCachedCompanyName = async () => {
  await Configuration.createTable();
  for (const key of ["COMPANY_NAME", "SQL_COMPANY_NAME"]) {
    const value = String((await Configuration.getConfigValue(key)) || "").trim();
    if (value) {
      return value;
    }
  }
  return "";
};

export const getCompanyNameFromSqlConfig = async () => {
  const cached = await getCachedCompanyName().catch(() => "");
  if (cached) {
    return cached;
  }

  const config = await loadSqlConfig().catch(() => null);
  if (!config || config.mode !== "ONLINE") {
    return "";
  }

  try {
    const query = `
      SELECT TOP 1 LTRIM(RTRIM(ISNULL(Valor, ''))) AS companyName
      FROM [dbo].[TA_CONFIGURACION]
      WHERE LTRIM(RTRIM(ISNULL(Clave, ''))) = 'NOMBRE'
    `;
    const rows = await executeSqlServerQuery(query, config);
    const companyName = String(rows?.[0]?.companyName ?? rows?.[0]?.Valor ?? "").trim();
    if (!companyName) {
      return "";
    }

    await Configuration.setConfigValue("COMPANY_NAME", companyName).catch(() => {});
    await Configuration.setConfigValue("SQL_COMPANY_NAME", companyName).catch(() => {});
    return companyName;
  } catch (error) {
    return "";
  }
};

export const findCatalogByCodes = async ({
  codes = [],
  classPrice = 1,
} = {}) => {
  const uniqueCodes = Array.from(
    new Set(
      (codes || []).map((code) => String(code ?? "").trim()).filter(Boolean),
    ),
  );

  if (uniqueCodes.length === 0) {
    return [];
  }

  const config = await loadSqlConfig();
  if (config.mode !== "ONLINE") {
    throw new Error(
      "La consulta remota solo está disponible en modo SQL Online.",
    );
  }

  const normalizedInClause = uniqueCodes
    .map((code) => sqlLiteral(normalizeSearchText(code)))
    .join(",");
  const quotedCodes = uniqueCodes.map((code) => sqlLiteral(code)).join(",");
  const objectName = buildObjectName(config.objectName);
  const codeField = buildFieldReference(config.codeField, "CodigoArticulo");
  const barcodeField = buildFieldReference(config.barcodeField, "CodigoBarra");
  const selectColumns = buildCatalogColumns(config);

  const query = `
    SELECT ROW_NUMBER() OVER (ORDER BY LOWER(LTRIM(RTRIM(ISNULL(${buildFieldReference(config.descriptionField, "Descripcion")}, '')))), LOWER(LTRIM(RTRIM(ISNULL(${codeField}, ''))))) AS id, ${selectColumns}
    FROM ${objectName}
    WHERE (
      LTRIM(RTRIM(ISNULL(${codeField}, ''))) IN (${quotedCodes})
      OR REPLACE(LTRIM(RTRIM(ISNULL(${codeField}, ''))), ' ', '') IN (${normalizedInClause})
      OR LTRIM(RTRIM(ISNULL(${barcodeField}, ''))) IN (${quotedCodes})
      OR REPLACE(LTRIM(RTRIM(ISNULL(${barcodeField}, ''))), ' ', '') IN (${normalizedInClause})
    )
  `;

  const rows = await executeSqlServerQuery(query, config);
  return rows.map((row) => getRowPriceClass(row, classPrice, config.useStockColumn));
};

export const findCatalogByBarcodePrefix = async ({
  scannedCode = "",
  classPrice = 1,
} = {}) => {
  const config = await loadSqlConfig();
  if (config.mode !== "ONLINE") {
    throw new Error(
      "La consulta remota solo está disponible en modo SQL Online.",
    );
  }

  const normalized = normalizeSearchText(scannedCode);
  if (!normalized) {
    return [];
  }

  const objectName = buildObjectName(config.objectName);
  const codeField = buildFieldReference(config.codeField, "CodigoArticulo");
  const barcodeField = buildFieldReference(config.barcodeField, "CodigoBarra");
  const descriptionField = buildFieldReference(
    config.descriptionField,
    "Descripcion",
  );
  const selectColumns = buildCatalogColumns(config);
  const query = `
    SELECT TOP 50 ROW_NUMBER() OVER (ORDER BY LOWER(LTRIM(RTRIM(ISNULL(${descriptionField}, '')))), LOWER(LTRIM(RTRIM(ISNULL(${codeField}, ''))))) AS id, ${selectColumns}
    FROM ${objectName}
    WHERE (
      '${normalized}' LIKE REPLACE(LTRIM(RTRIM(ISNULL(${codeField}, ''))), ' ', '') + '%'
      OR '${normalized}' LIKE REPLACE(LTRIM(RTRIM(ISNULL(${barcodeField}, ''))), ' ', '') + '%'
    )
  `;

  const rows = await executeSqlServerQuery(query, config);
  return rows.map((row) => getRowPriceClass(row, classPrice, config.useStockColumn));
};

export const syncCatalogToLocal = async ({ onProgress } = {}) => {
  const config = await loadSqlConfig();
  if (config.mode !== "LOCAL") {
    throw new Error(
      "La sincronización local solo aplica cuando SQL_MODE está en SQL Local.",
    );
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
      code: String(row?.code ?? row?.codigoArticulo ?? "").trim(),
      codigoArticulo: String(row?.codigoArticulo ?? row?.code ?? "").trim(),
      codigoBarras: String(row?.codigoBarras ?? row?.codigoBarra ?? "").trim(),
      codigoBarra: String(row?.codigoBarra ?? row?.codigoBarras ?? "").trim(),
      codigoBarra1: String(row?.codigoBarra1 ?? "").trim(),
      codigoBarra2: String(row?.codigoBarra2 ?? "").trim(),
      codigoBarra3: String(row?.codigoBarra3 ?? "").trim(),
      codigoBarra4: String(row?.codigoBarra4 ?? "").trim(),
      codigoBarraDun: String(row?.codigoBarraDun ?? "").trim(),
      name: String(row?.name ?? row?.descripcion ?? "").trim(),
      descripcion: String(row?.descripcion ?? row?.name ?? "").trim(),
      fechaActualizacion: String(
        row?.fechaActualizacion ?? row?.FechaActualizacion ?? "",
      ).trim(),
      category: String(row?.category ?? "").trim(),
      family: String(row?.family ?? "").trim(),
      iva: safeFloat(row?.iva, 0),
      internal_taxes: safeFloat(row?.internal_taxes, 0),
      cant_propuesta: safeFloat(row?.cant_propuesta, 0),
      exempt: safeFloat(row?.exempt, 0),
      precio: safeFloat(row?.precio ?? row?.price1, 0),
      stock: config.useStockColumn ? safeFloat(row?.stock, 0) : null,
      price1: safeFloat(row?.price1 ?? row?.precio, 0),
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
          id, code, codigoArticulo, codigoBarras, codigoBarra, codigoBarra1, codigoBarra2, codigoBarra3, codigoBarra4, codigoBarraDun,
          name, descripcion, fechaActualizacion, category, family, iva, internal_taxes, cant_propuesta, exempt, precio, stock,
          price1, price2, price3, price4, price5, price6, price7, price8, price9, price10
        )
        SELECT
          id, code, codigoArticulo, codigoBarras, codigoBarra, codigoBarra1, codigoBarra2, codigoBarra3, codigoBarra4, codigoBarraDun,
          name, descripcion, fechaActualizacion, category, family, iva, internal_taxes, cant_propuesta, exempt, precio, stock,
          price1, price2, price3, price4, price5, price6, price7, price8, price9, price10
        FROM ${quoteIdentifier(stagingTable)}
      `,
      [],
    );
    tx.executeSql(`DELETE FROM ${quoteIdentifier(stagingTable)}`, []);
  });

  return {
    inserted,
    mode: config.mode,
    server: buildTargetServer(config).host,
    objectName: config.objectName,
  };
};

export const readCatalogConfigSummary = async () => {
  const config = await loadSqlConfig();
  const target = buildTargetServer(config);
  return {
    mode: config.mode,
    connectionMode: config.connectionMode,
    server: target.host,
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
  findCatalogByBarcodeExact,
  getCompanyNameFromSqlConfig,
  findCatalogByCodes,
  findCatalogByBarcodePrefix,
  syncCatalogToLocal,
  readCatalogConfigSummary,
};

export default CatalogService;
