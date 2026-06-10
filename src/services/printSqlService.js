import Configuration from "@db/Configuration";
import { getCatalogConfig } from "@services/catalogService";
import { resolvePreviewFontFamily } from "@services/printFontService";
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

const toStringValue = (value, fallback = "") =>
  String(value ?? fallback).trim();

const readSqlRows = (result) => {
  if (Array.isArray(result)) {
    return result;
  }

  return result?.rows || result?.recordset || [];
};

const normalizeCode = (value, index = 0) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (PRINT_CODES.includes(normalized)) {
    return normalized;
  }
  return PRINT_CODES[index] || PRINT_CODES[0];
};

const normalizeContractText = (value = "") =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[áäàâ]/g, "a")
    .replace(/[éëèê]/g, "e")
    .replace(/[íïìî]/g, "i")
    .replace(/[óöòô]/g, "o")
    .replace(/[úüùû]/g, "u")
    .replace(/[\s_-]+/g, "");

const normalizeSqlContractType = (value = "") => {
  const normalized = normalizeContractText(value);
  if (!normalized) {
    return "texto";
  }
  if (normalized === "dato" || normalized === "empresa") return "Dato";
  if (
    normalized === "texto" ||
    normalized === "text" ||
    normalized === "descripcion"
  )
    return "texto";
  if (normalized === "precio") return "precio";
  if (normalized === "codigobarra" || normalized === "barcode") {
    return "codigobarra";
  }
  if (
    normalized === "linea" ||
    normalized === "line" ||
    normalized === "separator" ||
    normalized === "separador"
  ) {
    return "linea";
  }
  if (normalized === "logo") return "Dato";
  if (normalized === "price") return "precio";
  return "texto";
};

const normalizeSqlContractCampo = (tipoElemento = "", campo = "") => {
  const tipo = normalizeSqlContractType(tipoElemento);
  const normalizedCampo = normalizeContractText(campo);

  if (tipo === "Dato") return "Empresa";
  if (tipo === "texto") return "Descripcion";
  if (tipo === "precio") return "Precio";
  if (tipo === "codigobarra") return "CodigoBarra";
  if (tipo === "linea") return "TextoFijo";

  if (normalizedCampo === "empresa" || normalizedCampo === "companyname") {
    return "Empresa";
  }
  if (normalizedCampo === "descripcion" || normalizedCampo === "description") {
    return "Descripcion";
  }
  if (normalizedCampo === "precio" || normalizedCampo === "price") {
    return "Precio";
  }
  if (
    normalizedCampo === "codigobarra" ||
    normalizedCampo === "codigobarras" ||
    normalizedCampo === "barcode"
  ) {
    return "CodigoBarra";
  }
  if (
    normalizedCampo === "codigoarticulo" ||
    normalizedCampo === "codigointerno" ||
    normalizedCampo === "internalcode"
  ) {
    return "CodigoArticulo";
  }
  if (normalizedCampo === "textofijo" || normalizedCampo === "fixedtext") {
    return "TextoFijo";
  }

  return campo ? String(campo).trim() : "TextoFijo";
};

const normalizeSqlContractValueKey = (campo = "", tipoElemento = "") => {
  const normalizedCampo = normalizeContractText(campo);
  const tipo = normalizeSqlContractType(tipoElemento);

  if (
    tipo === "Dato" ||
    normalizedCampo === "empresa" ||
    normalizedCampo === "companyname"
  ) {
    return "companyName";
  }
  if (
    tipo === "texto" ||
    normalizedCampo === "descripcion" ||
    normalizedCampo === "description"
  ) {
    return "description";
  }
  if (
    tipo === "precio" ||
    normalizedCampo === "precio" ||
    normalizedCampo === "price"
  ) {
    return "price";
  }
  if (
    tipo === "codigobarra" ||
    normalizedCampo === "codigobarra" ||
    normalizedCampo === "codigobarras" ||
    normalizedCampo === "barcode"
  ) {
    return "barcode";
  }
  if (
    normalizedCampo === "codigoarticulo" ||
    normalizedCampo === "codigointerno" ||
    normalizedCampo === "internalcode"
  ) {
    return "internalCode";
  }
  if (normalizedCampo === "stock") return "stock";
  if (normalizedCampo === "fecha" || normalizedCampo === "date") return "date";
  if (normalizedCampo === "logo") return "logo";
  if (tipo === "linea") return "separator";
  if (normalizedCampo === "textofijo" || normalizedCampo === "fixedtext") {
    return "separator";
  }

  return normalizeSqlFieldKey(campo, tipoElemento || "text", campo);
};

const normalizeSyncItemLabel = (item = {}) => {
  const rawLabel = String(
    item.campo ??
      item.Campo ??
      item.label ??
      item.key ??
      item.valueKey ??
      "Item",
  ).trim();
  const normalized = normalizeContractText(rawLabel);

  if (normalized === "empresa" || normalized === "companyname") {
    return "Empresa";
  }
  if (normalized === "descripcion" || normalized === "description") {
    return "Descripcion";
  }
  if (normalized === "precio" || normalized === "price") {
    return "Precio";
  }
  if (normalized === "codigobarra" || normalized === "barcode") {
    return "CodigoBarra";
  }
  if (
    normalized === "codigoarticulo" ||
    normalized === "codigointerno" ||
    normalized === "internalcode"
  ) {
    return "CodigoArticulo";
  }
  if (normalized === "stock") {
    return "Stock";
  }
  if (normalized === "fecha" || normalized === "date") {
    return "Fecha";
  }
  if (normalized === "linea" || normalized === "line") {
    return "Linea";
  }
  if (normalized === "textofijo" || normalized === "fixedtext") {
    return "TextoFijo";
  }

  return rawLabel || "Item";
};

const buildSqlConfig = async () => {
  const config = await getCatalogConfig().catch(() => null);
  if (
    !config ||
    String(config.mode ?? "")
      .trim()
      .toUpperCase() !== "ONLINE"
  ) {
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
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (
    normalized === "barcode" ||
    normalized === "codigobarra" ||
    normalized === "codigobarras" ||
    normalized === "codigo_barra" ||
    normalized === "codigo de barra"
  ) {
    return "barcode";
  }
  if (
    normalized === "separator" ||
    normalized === "separador" ||
    normalized === "line" ||
    normalized === "linea" ||
    normalized === "línea" ||
    normalized === "linea_separadora" ||
    normalized === "separator_line"
  ) {
    return "separator";
  }
  if (normalized === "logo") {
    return "logo";
  }
  if (
    normalized === "dato" ||
    normalized === "texto" ||
    normalized === "text" ||
    normalized === "precio"
  ) {
    return "text";
  }
  return "text";
};

const normalizeSqlFieldKey = (value, type = "text", fallback = "") => {
  const raw = String(value ?? fallback ?? "")
    .trim()
    .toLowerCase();
  const compact = raw.replace(/[\s_-]+/g, "");

  if (!raw) {
    if (type === "barcode") return "barcode";
    if (type === "logo") return "logo";
    if (type === "separator") return "separator";
    return "";
  }

  if (
    compact === "descripcion" ||
    compact === "description" ||
    compact === "desc" ||
    compact === "detalle"
  ) {
    return "description";
  }
  if (compact === "precio" || compact === "price" || compact === "valor") {
    return "price";
  }
  if (
    compact === "empresa" ||
    compact === "nombreempresa" ||
    compact === "companyname" ||
    compact === "razonsocial"
  ) {
    return "companyName";
  }
  if (
    compact === "codigobarra" ||
    compact === "codigobarras" ||
    compact === "barcode" ||
    compact === "barras" ||
    compact === "barra"
  ) {
    return "barcode";
  }
  if (
    compact === "codigointerno" ||
    compact === "codigoarticulo" ||
    compact === "codigoproducto" ||
    compact === "interno" ||
    compact === "code" ||
    compact === "codigo"
  ) {
    return type === "barcode" ? "barcode" : "internalCode";
  }
  if (compact === "stock") {
    return "stock";
  }
  if (compact === "fecha" || compact === "date") {
    return "date";
  }
  if (compact === "logo") {
    return "logo";
  }
  if (
    compact === "separador" ||
    compact === "separator" ||
    compact === "linea" ||
    compact === "line"
  ) {
    return "separator";
  }

  return raw;
};

const mapSqlDetailToElement = (row = {}, index = 0) => {
  const tipoElemento = normalizeSqlContractType(
    row.TipoElemento ?? row.tipoElemento,
  );
  const rawField = toStringValue(
    row.Campo ?? row.campo ?? row.ValueKey ?? row.Valuekey,
  );
  const textoFijo = toStringValue(row.TextoFijo ?? row.textoFijo ?? "");
  const campo = normalizeSqlContractCampo(tipoElemento, rawField);
  const isLine = tipoElemento === "linea";
  const type = isLine
    ? "separator"
    : tipoElemento === "codigobarra"
      ? "barcode"
      : "text";
  const valueKey = isLine
    ? "separator"
    : normalizeSqlContractValueKey(campo, tipoElemento);
  const fontSize = toInt(
    row.TamanoFuente ?? row.tamanoFuente ?? row.FontSize,
    16,
  );
  const maxLines = Math.max(
    1,
    toInt(row.MaxLineas ?? row.maxLineas ?? row.MaxLines, 1),
  );
  const italic = toBool(
    row.Italica ?? row.italica ?? row.Italic ?? row.italic,
    false,
  );
  const rawTipoFuente = toStringValue(row.TipoFuente ?? row.tipoFuente ?? "");
  const tipoFuente = rawTipoFuente || "Default";

  return {
    key: valueKey || `element_${index + 1}`,
    campo,
    Campo: campo,
    tipoElemento,
    TipoElemento: tipoElemento,
    type,
    label:
      textoFijo ||
      toStringValue(row.Nombre ?? row.nombre, campo) ||
      (type === "separator" ? "Separador" : campo),
    visible: toBool(row.Visible ?? row.visible, true),
    x: toInt(row.X ?? row.x, 0),
    y: toInt(row.Y ?? row.y, 0),
    width: toInt(row.Ancho ?? row.ancho, 0),
    height: toInt(row.Alto ?? row.alto, 0),
    fontSize,
    fontWeight: toBool(row.Negrita ?? row.negrita, false) ? "700" : "400",
    italic,
    fontStyle: italic ? "italic" : "normal",
    tipoFuente,
    TipoFuente: tipoFuente,
    fontFamily: resolvePreviewFontFamily(rawTipoFuente || "Default"),
    align: toStringValue(
      row.Alineacion ?? row.alineacion,
      "left",
    ).toLowerCase(),
    uppercase: toBool(row.Mayuscula ?? row.mayuscula, false),
    maxLines,
    zIndex: toInt(row.Orden ?? row.orden, index + 1),
    sampleText: textoFijo,
    valueKey,
    formatAsPrice: valueKey === "price",
    showSymbol: valueKey === "price",
    showNumber:
      valueKey === "barcode"
        ? toBool(row.ShowNumber ?? row.showNumber, false)
        : true,
    barcodeType: "EAN13",
  };
};

const mapSqlHeaderToFormat = (row = {}, index = 0, elements = []) => {
  const code = normalizeCode(row.Codigo ?? row.codigo, index);
  const widthMm = toInt(
    row.AnchoPapelMm ?? row.anchoPapelMm,
    code === "product" || code === "small" ? 58 : 80,
  );
  const heightMm = toInt(row.AltoMm ?? row.altoMm, 0);
  const displayName = toStringValue(
    row.Nombre ?? row.nombre,
    DISPLAY_NAMES[code] || code,
  );

  const visibleKeys = new Set(
    elements
      .filter((item) => item.visible)
      .map((item) =>
        normalizeContractText(
          item.campo ?? item.Campo ?? item.valueKey ?? item.key ?? "",
        ),
      ),
  );

  return {
    __source: "SQL",
    key: code,
    name: displayName,
    paperWidth: widthMm === 58 || widthMm === 80 ? String(widthMm) : "custom",
    customPaperWidth:
      widthMm === 58 || widthMm === 80 ? "" : String(widthMm || ""),
    customPaperHeight: heightMm > 0 ? String(heightMm) : "",
    paperHeight: heightMm > 0 ? "custom" : "auto",
    copies: "1",
    marginTop: "0",
    marginBottom: "0",
    alignment: "center",
    showDescription:
      visibleKeys.has("descripcion") || visibleKeys.has("description"),
    showPrice: visibleKeys.has("precio") || visibleKeys.has("price"),
    showBarcode: visibleKeys.has("codigobarra") || visibleKeys.has("barcode"),
    showStock: visibleKeys.has("stock"),
    showDate: visibleKeys.has("date"),
    showCompanyName:
      visibleKeys.has("empresa") || visibleKeys.has("companyname"),
    showInternalCode:
      visibleKeys.has("codigoarticulo") ||
      visibleKeys.has("codigointerno") ||
      visibleKeys.has("internalcode"),
    showLogo: visibleKeys.has("logo"),
    boldPrice: Boolean(
      elements.find((item) => item.key === "price")?.fontWeight === "700",
    ),
    previewBeforePrint: true,
    elements,
  };
};

const ensurePrintSqlSchema = async () => {
  const createHeader = `
    IF OBJECT_ID(N'dbo.Scan_Reporte', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Scan_Reporte (
        IdReporte INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Codigo NVARCHAR(50) NOT NULL UNIQUE,
        Nombre NVARCHAR(100) NOT NULL,
        Descripcion NVARCHAR(250) NULL,
        AnchoPapelMm INT NOT NULL CONSTRAINT DF_Scan_Reporte_AnchoPapelMm DEFAULT (80),
        AltoMm INT NULL,
        Activo BIT NOT NULL CONSTRAINT DF_Scan_Reporte_Activo DEFAULT (1),
        EsPredeterminado BIT NOT NULL CONSTRAINT DF_Scan_Reporte_EsPredeterminado DEFAULT (0),
        FechaAlta DATETIME NOT NULL CONSTRAINT DF_Scan_Reporte_FechaAlta DEFAULT (GETDATE()),
        FechaModificacion DATETIME NULL
      );
    END;
  `;

  const createDetail = `
    IF OBJECT_ID(N'dbo.Scan_ReporteDetalle', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Scan_ReporteDetalle (
        IdDetalle INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        IdReporte INT NOT NULL,
        TipoElemento NVARCHAR(30) NOT NULL,
        Campo NVARCHAR(50) NULL,
        TextoFijo NVARCHAR(250) NULL,
        X INT NOT NULL CONSTRAINT DF_Scan_ReporteDetalle_X DEFAULT (0),
        Y INT NOT NULL CONSTRAINT DF_Scan_ReporteDetalle_Y DEFAULT (0),
        Ancho INT NOT NULL CONSTRAINT DF_Scan_ReporteDetalle_Ancho DEFAULT (100),
        Alto INT NOT NULL CONSTRAINT DF_Scan_ReporteDetalle_Alto DEFAULT (30),
        TamanoFuente INT NOT NULL CONSTRAINT DF_Scan_ReporteDetalle_TamanoFuente DEFAULT (18),
        Negrita BIT NOT NULL CONSTRAINT DF_Scan_ReporteDetalle_Negrita DEFAULT (0),
        Alineacion NVARCHAR(20) NOT NULL CONSTRAINT DF_Scan_ReporteDetalle_Alineacion DEFAULT ('center'),
        TipoFuente NVARCHAR(100) NULL,
        Visible BIT NOT NULL CONSTRAINT DF_Scan_ReporteDetalle_Visible DEFAULT (1),
        Orden INT NOT NULL CONSTRAINT DF_Scan_ReporteDetalle_Orden DEFAULT (0),
        MaxLineas INT NOT NULL CONSTRAINT DF_Scan_ReporteDetalle_MaxLineas DEFAULT (1),
        Mayuscula BIT NOT NULL CONSTRAINT DF_Scan_ReporteDetalle_Mayuscula DEFAULT (0),
        Italica BIT NOT NULL CONSTRAINT DF_Scan_ReporteDetalle_Italica DEFAULT (0),
        FechaModificacion DATETIME NULL,
        CONSTRAINT FK_Scan_ReporteDetalle_Reporte FOREIGN KEY (IdReporte) REFERENCES dbo.Scan_Reporte(IdReporte)
      );
    END;

    IF COL_LENGTH('dbo.Scan_ReporteDetalle', 'Italica') IS NULL
    BEGIN
      ALTER TABLE dbo.Scan_ReporteDetalle
        ADD Italica BIT NOT NULL CONSTRAINT DF_Scan_ReporteDetalle_Italica DEFAULT (0) WITH VALUES;
    END;

    IF COL_LENGTH('dbo.Scan_ReporteDetalle', 'TipoFuente') IS NULL
    BEGIN
      ALTER TABLE dbo.Scan_ReporteDetalle
        ADD TipoFuente NVARCHAR(100) NULL;
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
      .sort(
        (a, b) =>
          toInt(a.Orden ?? a.orden, 0) - toInt(b.Orden ?? b.orden, 0) ||
          toInt(a.Y ?? a.y, 0) - toInt(b.Y ?? b.y, 0) ||
          toInt(a.X ?? a.x, 0) - toInt(b.X ?? b.x, 0) ||
          toInt(a.IdDetalle ?? a.idDetalle, 0) -
            toInt(b.IdDetalle ?? b.idDetalle, 0),
      )
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

    const italicColumnRows = readSqlRows(
      await executeSql(`
        SELECT CASE
          WHEN COL_LENGTH('dbo.Scan_ReporteDetalle', 'Italica') IS NULL THEN 0
          ELSE 1
        END AS HasItalica
      `),
    );
    const hasItalicColumn = Boolean(
      italicColumnRows[0]?.HasItalica ??
      italicColumnRows[0]?.hasItalicColumn ??
      0,
    );

    const loadRows = async (activeOnly = true) => {
      const activeClause = activeOnly ? "AND ISNULL(r.Activo, 1) = 1" : "";
      const headerRows = await executeSql(`
        SELECT r.IdReporte, r.Codigo, r.Nombre, r.Descripcion, r.AnchoPapelMm, r.AltoMm, r.Activo, r.EsPredeterminado
        FROM dbo.Scan_Reporte r
        WHERE r.Codigo IN (${PRINT_CODES.map(sqlLiteral).join(", ")})
        ${activeClause}
      `);

      const detailItalicColumn = hasItalicColumn
        ? "d.Italica"
        : "CAST(0 AS BIT) AS Italica";

      const hasTipoFuenteColumnRows = readSqlRows(
        await executeSql(`SELECT CASE
          WHEN COL_LENGTH('dbo.Scan_ReporteDetalle', 'TipoFuente') IS NULL THEN 0
          ELSE 1
        END AS HasTipoFuente`),
      );
      const hasTipoFuenteColumn = Boolean(
        hasTipoFuenteColumnRows[0]?.HasTipoFuente ??
        hasTipoFuenteColumnRows[0]?.hasTipoFuente ??
        0,
      );

      const detailFontColumn = hasTipoFuenteColumn
        ? "d.TipoFuente"
        : "CAST(NULL AS NVARCHAR(100)) AS TipoFuente";

      const detailRows = await executeSql(`
        SELECT
          r.Codigo,
          d.IdReporte,
          d.TipoElemento,
          d.Campo,
          d.TextoFijo,
          d.X,
          d.Y,
          d.Ancho,
          d.Alto,
          d.TamanoFuente,
          d.Negrita,
          d.Alineacion,
          d.Visible,
          d.Orden,
          d.MaxLineas,
          d.Mayuscula,
          ${detailFontColumn},
          ${detailItalicColumn}
        FROM dbo.Scan_ReporteDetalle d
        INNER JOIN dbo.Scan_Reporte r ON r.IdReporte = d.IdReporte
        WHERE r.Codigo IN (${PRINT_CODES.map(sqlLiteral).join(", ")})
        ${activeClause}
        ORDER BY r.Codigo, d.Orden, d.Y, d.X, d.IdDetalle
      `);

      const headers = readSqlRows(headerRows);
      const details = readSqlRows(detailRows);

      return { headers, details };
    };

    let { headers, details } = await loadRows(true);
    if (!headers.length && !details.length) {
      if (__DEV__) {
        console.log(
          "[PRINT_SQL] no active rows, retrying without active filter",
        );
      }
      ({ headers, details } = await loadRows(false));
    }

    if (__DEV__) {
      console.log("[PRINT_SQL] rows", {
        headers: headers.length,
        details: details.length,
      });
    }

    if (!headers.length && !details.length) {
      return null;
    }

    const loaded = {};
    for (let i = 0; i < PRINT_CODES.length; i += 1) {
      const code = PRINT_CODES[i];
      const header = headers.find(
        (row) => normalizeCode(row.Codigo ?? row.codigo, i) === code,
      );
      if (!header) {
        continue;
      }

      const detailRows = details
        .filter((row) => normalizeCode(row.Codigo ?? row.codigo, i) === code)
        .sort(
          (a, b) =>
            toInt(a.Orden ?? a.orden, 0) - toInt(b.Orden ?? b.orden, 0) ||
            toInt(a.Y ?? a.y, 0) - toInt(b.Y ?? b.y, 0) ||
            toInt(a.X ?? a.x, 0) - toInt(b.X ?? b.x, 0) ||
            toInt(a.IdDetalle ?? a.idDetalle, 0) -
              toInt(b.IdDetalle ?? b.idDetalle, 0),
        )
        .map((row, index) => mapSqlDetailToElement(row, index));

      if (__DEV__) {
        console.log(`[PRINT_SQL] ${code} details ${detailRows.length}`);
        detailRows.forEach((row) => {
          const fieldName = toStringValue(
            row.Campo ?? row.campo ?? row.ValueKey ?? row.Valuekey,
            "",
          );
          const tipoFuente = toStringValue(
            row.TipoFuente ?? row.tipoFuente ?? "",
            "Default",
          );
          console.log(
            `[PRINT_SQL] item Campo ${fieldName || "Item"} TipoFuente ${tipoFuente || "Default"} Visible ${toBool(row.Visible ?? row.visible, true) ? 1 : 0}`,
          );
        });
      }

      loaded[code] = mapSqlHeaderToFormat(header, i, detailRows);
    }

    if (__DEV__) {
      console.log("[PRINT_SQL] loaded codes", Object.keys(loaded));
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

    const codesToSave = PRINT_CODES.map((code, index) =>
      normalizeCode(code, index),
    );
    const reportIds = await executeSql(`
      SELECT IdReporte, Codigo
      FROM dbo.Scan_Reporte
      WHERE Codigo IN (${codesToSave.map(sqlLiteral).join(", ")})
    `);
    const existingReports = readSqlRows(reportIds);
    const existingCodes = existingReports
      .map((row) => normalizeCode(row.Codigo ?? row.codigo))
      .filter(Boolean);
    if (existingCodes.length > 0) {
      await executeSql(`DELETE FROM dbo.Scan_ReporteDetalle WHERE IdReporte IN (
        SELECT IdReporte FROM dbo.Scan_Reporte WHERE Codigo IN (${existingCodes.map(sqlLiteral).join(", ")})
      )`);
      await executeSql(
        `DELETE FROM dbo.Scan_Reporte WHERE Codigo IN (${existingCodes.map(sqlLiteral).join(", ")})`,
      );
    }

    for (let index = 0; index < PRINT_CODES.length; index += 1) {
      const code = PRINT_CODES[index];
      const format = formats?.[code] || {};
      const elements = Array.isArray(format.elements) ? format.elements : [];
      const widthMm =
        format.paperWidth === "custom"
          ? toInt(format.customPaperWidth, index === 0 || index === 3 ? 80 : 58)
          : toInt(format.paperWidth, index === 0 || index === 3 ? 80 : 58);
      const heightMm = toInt(format.customPaperHeight, 0);

      await executeSql(`
        INSERT INTO dbo.Scan_Reporte (Codigo, Nombre, Descripcion, AnchoPapelMm, AltoMm, Activo, EsPredeterminado, FechaAlta, FechaModificacion)
        VALUES (
          ${sqlLiteral(code)},
          ${sqlLiteral(format.name || DISPLAY_NAMES[code] || code)},
          ${sqlLiteral(format.description || "")},
          ${Number.isFinite(widthMm) ? widthMm : 80},
          ${heightMm > 0 ? heightMm : "NULL"},
          1,
          ${index === 0 ? 1 : 0},
          GETDATE(),
          NULL
        );
      `);
      const insertedLookup = await executeSql(`
        SELECT TOP 1 IdReporte
        FROM dbo.Scan_Reporte
        WHERE Codigo = ${sqlLiteral(code)}
        ORDER BY IdReporte DESC
      `);
      const insertedRows = Array.isArray(insertedLookup)
        ? insertedLookup
        : insertedLookup?.rows || insertedLookup?.recordset || [];
      const insertedId = toInt(
        insertedRows[0]?.IdReporte ?? insertedRows[0]?.idReporte,
        0,
      );
      if (!insertedId) {
        throw new Error(`No se pudo obtener IdReporte para ${code}.`);
      }

      for (
        let elementIndex = 0;
        elementIndex < elements.length;
        elementIndex += 1
      ) {
        const element = elements[elementIndex] || {};
        const rawSampleText = String(element.sampleText ?? "").trim();
        const isVisualLine =
          String(element.type ?? "")
            .trim()
            .toLowerCase() === "separator" ||
          String(element.key ?? "")
            .trim()
            .toLowerCase()
            .startsWith("separator") ||
          /^-+$/.test(rawSampleText.replace(/\s+/g, ""));
        const sqlTipoElemento = normalizeSqlContractType(
          isVisualLine
            ? "linea"
            : (element.TipoElemento ?? element.tipoElemento ?? element.type),
        );
        const sqlCampo = normalizeSqlContractCampo(
          sqlTipoElemento,
          element.Campo ?? element.campo ?? element.valueKey ?? element.key,
        );
        const sqlTextoFijo = isVisualLine
          ? rawSampleText || "------------"
          : String(element.sampleText ?? "");
        const visible = element.visible === false ? 0 : 1;
        const fontWeight =
          String(element.fontWeight ?? "400").trim() === "700" ? 1 : 0;
        const uppercase = element.uppercase ? 1 : 0;
        const maxLines = Math.max(1, toInt(element.maxLines, 1));
        const tipoFuente = String(
          element.TipoFuente ?? element.tipoFuente ?? element.fontFamily ?? "",
        ).trim();
        await executeSql(`
          INSERT INTO dbo.Scan_ReporteDetalle (
            IdReporte, TipoElemento, Campo, TextoFijo, X, Y, Ancho, Alto, TamanoFuente, Negrita, Alineacion, TipoFuente, Visible, Orden, MaxLineas, Mayuscula, Italica, FechaModificacion
          ) VALUES (
            ${insertedId},
            ${sqlLiteral(sqlTipoElemento)},
            ${sqlLiteral(sqlCampo)},
            ${sqlLiteral(sqlTextoFijo)},
            ${toInt(element.x, 0)},
            ${toInt(element.y, 0)},
            ${toInt(element.width, 0)},
            ${toInt(element.height, 0)},
            ${toInt(element.fontSize, 16)},
            ${fontWeight},
            ${sqlLiteral(String(element.align ?? "left"))},
            ${sqlLiteral(tipoFuente)},
            ${visible},
            ${toInt(element.zIndex, elementIndex + 1)},
            ${maxLines},
            ${uppercase},
            ${toBool(element.italic ?? element.italica, false) ? 1 : 0},
            NULL
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
  if (__DEV__) {
    console.log("[PRINT_SYNC] start");
  }

  try {
    const formats = await loadPrintFormatsFromSql();
    const loaded = Boolean(formats);

    if (__DEV__) {
      console.log("[PRINT_SYNC] loaded from SQL", loaded);
    }

    if (!loaded) {
      return null;
    }

    if (__DEV__) {
      console.log("[PRINT_SYNC] codes", PRINT_CODES.join(","));
      PRINT_CODES.forEach((code) => {
        const format = formats?.[code] || {};
        const elements = Array.isArray(format.elements) ? format.elements : [];
        console.log(`[PRINT_SYNC] ${code} elements ${elements.length}`);
        elements.forEach((item) => {
          console.log(
            `[PRINT_SYNC] item ${normalizeSyncItemLabel(item)} visible ${Boolean(item?.visible)}`,
          );
        });
      });
    }

    await Configuration.createTable();
    await Configuration.setConfigValue(
      "PRINT_FORMATS_JSON",
      JSON.stringify(formats),
    );

    if (__DEV__) {
      console.log("[PRINT_SYNC] saved local PRINT_FORMATS_JSON");
    }

    return formats;
  } catch (error) {
    if (__DEV__) {
      console.log("[PRINT_SYNC] error", error?.message || error);
    }
    return null;
  }
};
