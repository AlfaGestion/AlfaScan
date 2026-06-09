import Configuration from "@db/Configuration";
import { getCatalogConfig } from "@services/catalogService";
import { closeSql, connectSql, executeSql } from "@services/sqlClient";

const PRINT_CODES = ["gondola", "product", "small", "custom"];

const DISPLAY_NAMES = {
  gondola: "Góndola",
  product: "Producto",
  small: "Chico",
  custom: "Personalizado",
};

const sqlLiteral = (value) => `'${String(value ?? "").replace(/'/g, "''")}'`;

const toInt = (value, fallback = 0) => {
  const parsed = parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "t", "yes", "y", "si", "sí"].includes(normalized);
};

const toStringValue = (value, fallback = "") => String(value ?? fallback).trim();

const normalizeCode = (value, index = 0) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (PRINT_CODES.includes(normalized)) {
    return normalized;
  }
  return PRINT_CODES[index] || PRINT_CODES[0];
};

const buildSqlConfig = async () => {
  const config = await getCatalogConfig().catch(() => null);
  if (!config || String(config.mode ?? "").trim().toUpperCase() !== "ONLINE") {
    return null;
  }

  await Configuration.createTable();
  return {
    server: String(config.server ?? "").trim(),
    instance: String(config.instance ?? "").trim(),
    port: config.port ?? null,
    database: String(config.database ?? "").trim(),
    username: String(config.user ?? "").trim(),
    password: String(config.password ?? ""),
    timeout: toInt(config.timeout, 15),
    trustServerCertificate: Configuration.isTruthyConfigValue(
      await Configuration.getConfigValue("SQL_TRUST_SERVER_CERTIFICATE"),
    ),
    encrypt: Configuration.isTruthyConfigValue(
      await Configuration.getConfigValue("SQL_USE_SSL"),
    ),
  };
};

const connectPrintSql = async () => {
  const config = await buildSqlConfig();
  if (!config) {
    throw new Error("SQL Online no está disponible.");
  }

  await connectSql(config);
  return config;
};

const closePrintSql = async () => {
  await closeSql().catch(() => {});
};

const normalizeSqlElementType = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "barcode" || normalized === "codigo_barra" || normalized === "codigo de barra") {
    return "barcode";
  }
  if (normalized === "logo") {
    return "logo";
  }
  return "text";
};

const mapSqlDetailToElement = (row = {}, index = 0) => {
  const field = toStringValue(row.Campo ?? row.campo ?? row.ValueKey ?? row.Valuekey);
  const type = normalizeSqlElementType(row.TipoElemento ?? row.tipoElemento);
  const key = field || (type === "barcode" ? "barcode" : type === "logo" ? "logo" : `element_${index + 1}`);
  const fontSize = toInt(row.TamanoFuente ?? row.tamanoFuente ?? row.FontSize, 16);
  const maxLines = Math.max(1, toInt(row.MaxLineas ?? row.maxLineas ?? row.MaxLines, 1));

  return {
    key,
    type,
    label: toStringValue(row.TextoFijo ?? row.textoFijo ?? row.Nombre ?? row.nombre, key),
    visible: toBool(row.Visible ?? row.visible, true),
    x: toInt(row.X ?? row.x, 0),
    y: toInt(row.Y ?? row.y, 0),
    width: toInt(row.Ancho ?? row.ancho, 0),
    height: toInt(row.Alto ?? row.alto, 0),
    fontSize,
    fontWeight: toBool(row.Negrita ?? row.negrita, false) ? "700" : "400",
    align: toStringValue(row.Alineacion ?? row.alineacion, "left").toLowerCase(),
    uppercase: toBool(row.Mayuscula ?? row.mayuscula, false),
    maxLines,
    zIndex: toInt(row.Orden ?? row.orden, index + 1),
    sampleText: toStringValue(row.TextoFijo ?? row.textoFijo ?? ""),
    valueKey: field || key,
    formatAsPrice: key === "price",
    showSymbol: key === "price",
    showNumber: type !== "barcode" ? true : toBool(row.ShowNumber ?? row.showNumber, true),
    barcodeType: "EAN13",
  };
};

const mapSqlHeaderToFormat = (row = {}, index = 0, elements = []) => {
  const code = normalizeCode(row.Codigo ?? row.codigo, index);
  const widthMm = toInt(row.AnchoPapelMm ?? row.anchoPapelMm, code === "product" || code === "small" ? 58 : 80);
  const heightMm = toInt(row.AltoMm ?? row.altoMm, 0);
  const displayName = toStringValue(row.Nombre ?? row.nombre, DISPLAY_NAMES[code] || code);

  const visibleKeys = new Set(
    elements.filter((item) => item.visible).map((item) => String(item.valueKey ?? item.key ?? "").trim()),
  );

  return {
    key: code,
    name: displayName,
    paperWidth: widthMm === 58 || widthMm === 80 ? String(widthMm) : "custom",
    customPaperWidth: widthMm === 58 || widthMm === 80 ? "" : String(widthMm || ""),
    customPaperHeight: heightMm > 0 ? String(heightMm) : "",
    paperHeight: heightMm > 0 ? "custom" : "auto",
    copies: "1",
    marginTop: "0",
    marginBottom: "0",
    alignment: "center",
    showDescription: visibleKeys.has("description"),
    showPrice: visibleKeys.has("price"),
    showBarcode: visibleKeys.has("barcode"),
    showStock: visibleKeys.has("stock"),
    showDate: visibleKeys.has("date"),
    showCompanyName: visibleKeys.has("companyName"),
    showInternalCode: visibleKeys.has("internalCode"),
    showLogo: visibleKeys.has("logo"),
    boldPrice: Boolean(elements.find((item) => item.key === "price")?.fontWeight === "700"),
    previewBeforePrint: true,
    elements,
  };
};

const ensurePrintSqlSchema = async () => {
  const createHeader = `
    IF OBJECT_ID(N'dbo.Scan_Reporte', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Scan_Reporte (
        Codigo NVARCHAR(50) NOT NULL PRIMARY KEY,
        Nombre NVARCHAR(120) NOT NULL,
        AnchoPapelMm INT NULL,
        AltoMm INT NULL,
        Activo BIT NOT NULL CONSTRAINT DF_Scan_Reporte_Activo DEFAULT (1),
        EsPredeterminado BIT NOT NULL CONSTRAINT DF_Scan_Reporte_EsPredeterminado DEFAULT (0),
        ActualizadoEn DATETIME2 NOT NULL CONSTRAINT DF_Scan_Reporte_ActualizadoEn DEFAULT (SYSUTCDATETIME())
      );
    END;
  `;

  const createDetail = `
    IF OBJECT_ID(N'dbo.Scan_ReporteDetalle', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Scan_ReporteDetalle (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Codigo NVARCHAR(50) NOT NULL,
        TipoElemento NVARCHAR(40) NOT NULL,
        Campo NVARCHAR(80) NULL,
        TextoFijo NVARCHAR(400) NULL,
        X INT NULL,
        Y INT NULL,
        Ancho INT NULL,
        Alto INT NULL,
        TamanoFuente INT NULL,
        Negrita BIT NOT NULL CONSTRAINT DF_Scan_ReporteDetalle_Negrita DEFAULT (0),
        Alineacion NVARCHAR(20) NULL,
        Visible BIT NOT NULL CONSTRAINT DF_Scan_ReporteDetalle_Visible DEFAULT (1),
        Orden INT NULL,
        MaxLineas INT NULL,
        Mayuscula BIT NOT NULL CONSTRAINT DF_Scan_ReporteDetalle_Mayuscula DEFAULT (0)
      );
    END;
  `;

  await executeSql(createHeader);
  await executeSql(createDetail);
};

const rowsToSqlFormat = (rows = []) => {
  const byCode = new Map();
  const orderedCodes = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || {};
    const code = normalizeCode(row.Codigo ?? row.codigo, i);
    if (!byCode.has(code)) {
      byCode.set(code, []);
      orderedCodes.push(code);
    }
    byCode.get(code).push(row);
  }

  const result = {};
  for (let i = 0; i < orderedCodes.length; i += 1) {
    const code = orderedCodes[i];
    const detailRows = byCode.get(code) || [];
    const elements = detailRows
      .slice()
      .sort((a, b) => toInt(a.Orden ?? a.orden, 0) - toInt(b.Orden ?? b.orden, 0))
      .map((row, index) => mapSqlDetailToElement(row, index));
    const header = detailRows[0] || {};
    const format = mapSqlHeaderToFormat(header, i, elements);
    result[code] = format;
  }

  return result;
};

export const loadPrintFormatsFromSql = async () => {
  let connected = false;
  try {
    await connectPrintSql();
    connected = true;

    const headerRows = await executeSql(`
      SELECT Codigo, Nombre, AnchoPapelMm, AltoMm, Activo, EsPredeterminado
      FROM dbo.Scan_Reporte
      WHERE Codigo IN (${PRINT_CODES.map(sqlLiteral).join(", ")})
    `);

    const detailRows = await executeSql(`
      SELECT Codigo, TipoElemento, Campo, TextoFijo, X, Y, Ancho, Alto, TamanoFuente, Negrita, Alineacion, Visible, Orden, MaxLineas, Mayuscula
      FROM dbo.Scan_ReporteDetalle
      WHERE Codigo IN (${PRINT_CODES.map(sqlLiteral).join(", ")})
      ORDER BY Codigo, Orden, Id
    `);

    const headers = Array.isArray(headerRows) ? headerRows : headerRows?.rows || headerRows?.recordset || [];
    const details = Array.isArray(detailRows) ? detailRows : detailRows?.rows || detailRows?.recordset || [];

    if (!headers.length && !details.length) {
      return null;
    }

    const grouped = {};
    for (const row of [...headers, ...details]) {
      const code = normalizeCode(row.Codigo ?? row.codigo);
      if (!grouped[code]) {
        grouped[code] = [];
      }
      grouped[code].push(row);
    }

    const loaded = {};
    for (let i = 0; i < PRINT_CODES.length; i += 1) {
      const code = PRINT_CODES[i];
      const rowsForCode = grouped[code] || [];
      if (!rowsForCode.length) {
        continue;
      }

      const header = rowsForCode.find((row) => row.Nombre !== undefined || row.nombre !== undefined || row.AnchoPapelMm !== undefined) || rowsForCode[0] || {};
      const elements = rowsForCode
        .filter((row) => row.TipoElemento !== undefined || row.tipoElemento !== undefined)
        .sort((a, b) => toInt(a.Orden ?? a.orden, 0) - toInt(b.Orden ?? b.orden, 0))
        .map((row, index) => mapSqlDetailToElement(row, index));
      loaded[code] = mapSqlHeaderToFormat(header, i, elements);
    }

    return Object.keys(loaded).length ? loaded : null;
  } catch (error) {
    if (__DEV__) {
      console.log("[PRINT_SQL] load failed", error?.message || error);
    }
    return null;
  } finally {
    if (connected) {
      await closePrintSql().catch(() => {});
    }
  }
};

export const savePrintFormatsToSql = async (formats = {}) => {
  let connected = false;
  try {
    await connectPrintSql();
    connected = true;
    await ensurePrintSqlSchema();

    const codesToSave = PRINT_CODES.map((code, index) => normalizeCode(code, index));
    await executeSql(`DELETE FROM dbo.Scan_ReporteDetalle WHERE Codigo IN (${codesToSave.map(sqlLiteral).join(", ")})`);
    await executeSql(`DELETE FROM dbo.Scan_Reporte WHERE Codigo IN (${codesToSave.map(sqlLiteral).join(", ")})`);

    for (let index = 0; index < PRINT_CODES.length; index += 1) {
      const code = PRINT_CODES[index];
      const format = formats?.[code] || {};
      const elements = Array.isArray(format.elements) ? format.elements : [];
      const widthMm = format.paperWidth === "custom"
        ? toInt(format.customPaperWidth, index === 0 || index === 3 ? 80 : 58)
        : toInt(format.paperWidth, index === 0 || index === 3 ? 80 : 58);
      const heightMm = toInt(format.customPaperHeight, 0);

      await executeSql(`
        INSERT INTO dbo.Scan_Reporte (Codigo, Nombre, AnchoPapelMm, AltoMm, Activo, EsPredeterminado)
        VALUES (
          ${sqlLiteral(code)},
          ${sqlLiteral(format.name || DISPLAY_NAMES[code] || code)},
          ${Number.isFinite(widthMm) ? widthMm : "NULL"},
          ${heightMm > 0 ? heightMm : "NULL"},
          1,
          ${index === 0 ? 1 : 0}
        )
      `);

      for (let elementIndex = 0; elementIndex < elements.length; elementIndex += 1) {
        const element = elements[elementIndex] || {};
        const visible = element.visible === false ? 0 : 1;
        const fontWeight = String(element.fontWeight ?? "400").trim() === "700" ? 1 : 0;
        const uppercase = element.uppercase ? 1 : 0;
        const maxLines = Math.max(1, toInt(element.maxLines, 1));
        await executeSql(`
          INSERT INTO dbo.Scan_ReporteDetalle (
            Codigo, TipoElemento, Campo, TextoFijo, X, Y, Ancho, Alto, TamanoFuente, Negrita, Alineacion, Visible, Orden, MaxLineas, Mayuscula
          ) VALUES (
            ${sqlLiteral(code)},
            ${sqlLiteral(String(element.type ?? "text"))},
            ${sqlLiteral(String(element.valueKey ?? element.key ?? ""))},
            ${sqlLiteral(String(element.sampleText ?? ""))},
            ${toInt(element.x, 0)},
            ${toInt(element.y, 0)},
            ${toInt(element.width, 0)},
            ${toInt(element.height, 0)},
            ${toInt(element.fontSize, 16)},
            ${fontWeight},
            ${sqlLiteral(String(element.align ?? "left"))},
            ${visible},
            ${toInt(element.zIndex, elementIndex + 1)},
            ${maxLines},
            ${uppercase}
          )
        `);
      }
    }

    return true;
  } catch (error) {
    if (__DEV__) {
      console.log("[PRINT_SQL] save failed", error?.message || error);
    }
    throw new Error(error?.message || "No se pudo guardar el diseño en SQL.");
  } finally {
    if (connected) {
      await closePrintSql().catch(() => {});
    }
  }
};

export const syncPrintFormatsFromSql = async () => {
  const formats = await loadPrintFormatsFromSql();
  if (!formats) {
    return null;
  }

  await Configuration.createTable();
  await Configuration.setConfigValue("PRINT_FORMATS_JSON", JSON.stringify(formats));
  return formats;
};

