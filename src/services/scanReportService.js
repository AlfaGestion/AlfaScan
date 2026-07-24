import SQLite from "@db/SQLiteCompat";
import Configuration from "@db/Configuration";
import { closeSql, connectSql, executeSql } from "@services/sqlClient";

const DB_NAME = "AlfaScan.db";

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
  return ["1", "true", "t", "yes", "y", "si"].includes(normalized);
};

const toText = (value, fallback = "") => String(value ?? fallback).trim();

const readRows = (result) => {
  if (Array.isArray(result)) {
    return result;
  }

  return result?.rows?._array || result?.rows || result?.recordset || [];
};

const getLocalDb = async () => SQLite.openDatabase(DB_NAME);
let scanReportCache = {
  loadedAt: 0,
  reports: [],
  defaultReport: null,
};
let scanReportRefreshPromise = null;
let scanReportSyncPromise = null;

const cloneReport = (report) => {
  if (!report) {
    return null;
  }

  return {
    ...report,
    details: Array.isArray(report.details)
      ? report.details.map((detail) => ({ ...detail }))
      : [],
    elements: Array.isArray(report.elements)
      ? report.elements.map((element) => ({ ...element }))
      : [],
  };
};

const setScanReportCache = (reports = []) => {
  const clonedReports = Array.isArray(reports)
    ? reports.map((report) => cloneReport(report)).filter(Boolean)
    : [];
  const activeReports = clonedReports.filter((report) => report.Activo === 1);
  const activePred = activeReports.filter(
    (report) => report.EsPredeterminado === 1,
  );
  const defaultReport = activePred[0] || activeReports[0] || null;

  scanReportCache = {
    loadedAt: Date.now(),
    reports: clonedReports,
    defaultReport: cloneReport(defaultReport),
  };

  return scanReportCache;
};

export const getCachedScanReports = () =>
  scanReportCache.reports.map((report) => cloneReport(report)).filter(Boolean);

export const refreshScanReportCache = async () => {
  if (scanReportRefreshPromise) {
    return scanReportRefreshPromise;
  }

  scanReportRefreshPromise = (async () => {
    const reports = await loadScanReportsFromLocal();
    return setScanReportCache(reports);
  })();

  try {
    return await scanReportRefreshPromise;
  } finally {
    scanReportRefreshPromise = null;
  }
};

export const getCachedDefaultScanReport = async ({
  forceRefresh = false,
} = {}) => {
  if (
    forceRefresh ||
    !scanReportCache.loadedAt ||
    !scanReportCache.defaultReport
  ) {
    await refreshScanReportCache();
  }

  return cloneReport(scanReportCache.defaultReport);
};

const runLocalQuery = async (sql, params = []) => {
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    db.transaction(
      (tx) => {
        tx.executeSql(
          sql,
          params,
          (_tx, result) => {
            resolve(result);
          },
          (_tx, error) => {
            reject(error);
            return true;
          },
        );
      },
      (error) => reject(error),
    );
  });
};

const runLocalTransaction = async (work) => {
  const db = await getLocalDb();
  return db.transaction(async (tx) => {
    await work(tx);
  });
};

const hasLocalColumn = async (tableName, columnName) => {
  const rows = readRows(await runLocalQuery(`PRAGMA table_info(${tableName})`));
  return rows.some(
    (row) => String(row.name ?? row.NAME ?? "").trim() === columnName,
  );
};

const ensureLocalSchema = async () => {
  await runLocalTransaction(async (tx) => {
    await tx.executeSql(`
      CREATE TABLE IF NOT EXISTS Scan_Reporte (
        IdReporte INTEGER PRIMARY KEY,
        Codigo TEXT NOT NULL,
        Nombre TEXT NOT NULL,
        Descripcion TEXT,
        AnchoPapelMm INTEGER,
        AltoMm INTEGER,
        MargenIzq INTEGER NOT NULL DEFAULT 0,
        MargenSub INTEGER NOT NULL DEFAULT 0,
        MargenDer INTEGER NOT NULL DEFAULT 0,
        MargenInf INTEGER NOT NULL DEFAULT 0,
        MargenIzqMm INTEGER NOT NULL DEFAULT 0,
        MargenSupMm INTEGER NOT NULL DEFAULT 0,
        MargenDerMm INTEGER NOT NULL DEFAULT 0,
        MargenInfMm INTEGER NOT NULL DEFAULT 0,
        Activo INTEGER NOT NULL DEFAULT 1,
        EsPredeterminado INTEGER NOT NULL DEFAULT 0,
        FechaAlta TEXT,
        FechaModificacion TEXT
      )
    `);

    await tx.executeSql(`
      CREATE TABLE IF NOT EXISTS Scan_ReporteDetalle (
        IdDetalle INTEGER PRIMARY KEY,
        IdReporte INTEGER NOT NULL,
        TipoElemento TEXT NOT NULL,
        Campo TEXT,
        TextoFijo TEXT,
        X INTEGER NOT NULL DEFAULT 0,
        Y INTEGER NOT NULL DEFAULT 0,
        Ancho INTEGER NOT NULL DEFAULT 0,
        Alto INTEGER NOT NULL DEFAULT 0,
        TamanoFuente INTEGER NOT NULL DEFAULT 16,
        Negrita INTEGER NOT NULL DEFAULT 0,
        Alineacion TEXT,
        Visible INTEGER NOT NULL DEFAULT 1,
        Orden INTEGER NOT NULL DEFAULT 0,
        MaxLineas INTEGER NOT NULL DEFAULT 1,
        Mayuscula INTEGER NOT NULL DEFAULT 0,
        FechaModificacion TEXT,
        TipoFuente TEXT,
        Italica INTEGER NOT NULL DEFAULT 0
      )
    `);

    await tx.executeSql(
      `CREATE INDEX IF NOT EXISTS IX_Scan_Reporte_Codigo ON Scan_Reporte (Codigo)`,
    );
    await tx.executeSql(
      `CREATE INDEX IF NOT EXISTS IX_Scan_ReporteDetalle_IdReporte ON Scan_ReporteDetalle (IdReporte, Orden, IdDetalle)`,
    );
  });

  if (!(await hasLocalColumn("Scan_Reporte", "MargenIzqMm"))) {
    await runLocalTransaction(async (tx) => {
      await tx.executeSql(
        `ALTER TABLE Scan_Reporte ADD COLUMN MargenIzqMm INTEGER NOT NULL DEFAULT 0`,
      );
    });
  }
  if (!(await hasLocalColumn("Scan_Reporte", "MargenIzq"))) {
    await runLocalTransaction(async (tx) => {
      await tx.executeSql(
        `ALTER TABLE Scan_Reporte ADD COLUMN MargenIzq INTEGER NOT NULL DEFAULT 0`,
      );
    });
  }
  if (!(await hasLocalColumn("Scan_Reporte", "MargenSupMm"))) {
    await runLocalTransaction(async (tx) => {
      await tx.executeSql(
        `ALTER TABLE Scan_Reporte ADD COLUMN MargenSupMm INTEGER NOT NULL DEFAULT 0`,
      );
    });
  }
  if (!(await hasLocalColumn("Scan_Reporte", "MargenSub"))) {
    await runLocalTransaction(async (tx) => {
      await tx.executeSql(
        `ALTER TABLE Scan_Reporte ADD COLUMN MargenSub INTEGER NOT NULL DEFAULT 0`,
      );
    });
  }
  if (!(await hasLocalColumn("Scan_Reporte", "MargenDerMm"))) {
    await runLocalTransaction(async (tx) => {
      await tx.executeSql(
        `ALTER TABLE Scan_Reporte ADD COLUMN MargenDerMm INTEGER NOT NULL DEFAULT 0`,
      );
    });
  }
  if (!(await hasLocalColumn("Scan_Reporte", "MargenDer"))) {
    await runLocalTransaction(async (tx) => {
      await tx.executeSql(
        `ALTER TABLE Scan_Reporte ADD COLUMN MargenDer INTEGER NOT NULL DEFAULT 0`,
      );
    });
  }
  if (!(await hasLocalColumn("Scan_Reporte", "MargenInfMm"))) {
    await runLocalTransaction(async (tx) => {
      await tx.executeSql(
        `ALTER TABLE Scan_Reporte ADD COLUMN MargenInfMm INTEGER NOT NULL DEFAULT 0`,
      );
    });
  }
  if (!(await hasLocalColumn("Scan_Reporte", "MargenInf"))) {
    await runLocalTransaction(async (tx) => {
      await tx.executeSql(
        `ALTER TABLE Scan_Reporte ADD COLUMN MargenInf INTEGER NOT NULL DEFAULT 0`,
      );
    });
  }
};

const normalizeHeaderRow = (row = {}) => ({
  IdReporte: toInt(row.IdReporte ?? row.idReporte, 0),
  Codigo: toText(row.Codigo ?? row.codigo),
  Nombre: toText(row.Nombre ?? row.nombre),
  Descripcion: row.Descripcion ?? row.descripcion ?? null,
  AnchoPapelMm: row.AnchoPapelMm ?? row.anchoPapelMm ?? null,
  AltoMm: row.AltoMm ?? row.altoMm ?? null,
  MargenIzq: toInt(
    row.MargenIzq ?? row.MargenIzqMm ?? row.margenIzq ?? row.margenIzqMm,
    0,
  ),
  MargenSub: toInt(
    row.MargenSub ?? row.MargenSupMm ?? row.margenSub ?? row.margenSupMm,
    0,
  ),
  MargenDer: toInt(
    row.MargenDer ?? row.MargenDerMm ?? row.margenDer ?? row.margenDerMm,
    0,
  ),
  MargenInf: toInt(
    row.MargenInf ?? row.MargenInfMm ?? row.margenInf ?? row.margenInfMm,
    0,
  ),
  MargenIzqMm: toInt(
    row.MargenIzqMm ?? row.MargenIzq ?? row.margenIzqMm ?? row.margenIzq,
    0,
  ),
  MargenSupMm: toInt(
    row.MargenSupMm ?? row.MargenSub ?? row.margenSupMm ?? row.margenSub,
    0,
  ),
  MargenDerMm: toInt(
    row.MargenDerMm ?? row.MargenDer ?? row.margenDerMm ?? row.margenDer,
    0,
  ),
  MargenInfMm: toInt(
    row.MargenInfMm ?? row.MargenInf ?? row.margenInfMm ?? row.margenInf,
    0,
  ),
  Activo: toBool(row.Activo ?? row.activo, true) ? 1 : 0,
  EsPredeterminado: toBool(row.EsPredeterminado ?? row.esPredeterminado, false)
    ? 1
    : 0,
  FechaAlta: row.FechaAlta ?? row.fechaAlta ?? null,
  FechaModificacion: row.FechaModificacion ?? row.fechaModificacion ?? null,
});

const normalizeDetailRow = (row = {}) => ({
  IdDetalle: toInt(row.IdDetalle ?? row.idDetalle, 0),
  IdReporte: toInt(row.IdReporte ?? row.idReporte, 0),
  TipoElemento: toText(row.TipoElemento ?? row.tipoElemento, "texto"),
  Campo: row.Campo ?? row.campo ?? null,
  TextoFijo: row.TextoFijo ?? row.textoFijo ?? null,
  X: toInt(row.X ?? row.x, 0),
  Y: toInt(row.Y ?? row.y, 0),
  Ancho: toInt(row.Ancho ?? row.ancho, 0),
  Alto: toInt(row.Alto ?? row.alto, 0),
  TamanoFuente: toInt(row.TamanoFuente ?? row.tamanoFuente, 16),
  Negrita: toBool(row.Negrita ?? row.negrita, false) ? 1 : 0,
  Alineacion: toText(row.Alineacion ?? row.alineacion, "left"),
  Visible: toBool(row.Visible ?? row.visible, true) ? 1 : 0,
  Orden: toInt(row.Orden ?? row.orden, 0),
  MaxLineas: toInt(row.MaxLineas ?? row.maxLineas, 1) || 1,
  Mayuscula: toBool(row.Mayuscula ?? row.mayuscula, false) ? 1 : 0,
  FechaModificacion: row.FechaModificacion ?? row.fechaModificacion ?? null,
  TipoFuente: row.TipoFuente ?? row.tipoFuente ?? null,
  Italica: toBool(row.Italica ?? row.italica, false) ? 1 : 0,
});

const sqlValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return "NULL";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  return sqlLiteral(value);
};

const buildSqlConfig = async () => {
  const config = await getCatalogConfig().catch(() => null);
  if (!config) {
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

const connectScanSql = async () => {
  const config = await buildSqlConfig();
  if (!config) {
    throw new Error("Conexion SQL no disponible.");
  }

  await connectSql(config);
  return config;
};

const closeScanSql = async () => {
  await closeSql().catch(() => {});
};

const fetchSqlReports = async () => {
  let connected = false;
  try {
    await connectScanSql();
    connected = true;

    const headerRows = readRows(
      await executeSql(`
        SELECT
          IdReporte,
          Codigo,
          Nombre,
          Descripcion,
          AnchoPapelMm,
          AltoMm,
          CASE
            WHEN COL_LENGTH('dbo.Scan_Reporte', 'MargenIzq') IS NOT NULL THEN MargenIzq
            WHEN COL_LENGTH('dbo.Scan_Reporte', 'MargenIzqMm') IS NOT NULL THEN MargenIzqMm
            ELSE 0
          END AS MargenIzq,
          CASE
            WHEN COL_LENGTH('dbo.Scan_Reporte', 'MargenSub') IS NOT NULL THEN MargenSub
            WHEN COL_LENGTH('dbo.Scan_Reporte', 'MargenSupMm') IS NOT NULL THEN MargenSupMm
            ELSE 0
          END AS MargenSub,
          CASE
            WHEN COL_LENGTH('dbo.Scan_Reporte', 'MargenDer') IS NOT NULL THEN MargenDer
            WHEN COL_LENGTH('dbo.Scan_Reporte', 'MargenDerMm') IS NOT NULL THEN MargenDerMm
            ELSE 0
          END AS MargenDer,
          CASE
            WHEN COL_LENGTH('dbo.Scan_Reporte', 'MargenInf') IS NOT NULL THEN MargenInf
            WHEN COL_LENGTH('dbo.Scan_Reporte', 'MargenInfMm') IS NOT NULL THEN MargenInfMm
            ELSE 0
          END AS MargenInf,
          CASE
            WHEN COL_LENGTH('dbo.Scan_Reporte', 'MargenIzqMm') IS NOT NULL THEN MargenIzqMm
            WHEN COL_LENGTH('dbo.Scan_Reporte', 'MargenIzq') IS NOT NULL THEN MargenIzq
            ELSE 0
          END AS MargenIzqMm,
          CASE
            WHEN COL_LENGTH('dbo.Scan_Reporte', 'MargenSupMm') IS NOT NULL THEN MargenSupMm
            WHEN COL_LENGTH('dbo.Scan_Reporte', 'MargenSub') IS NOT NULL THEN MargenSub
            ELSE 0
          END AS MargenSupMm,
          CASE
            WHEN COL_LENGTH('dbo.Scan_Reporte', 'MargenDerMm') IS NOT NULL THEN MargenDerMm
            WHEN COL_LENGTH('dbo.Scan_Reporte', 'MargenDer') IS NOT NULL THEN MargenDer
            ELSE 0
          END AS MargenDerMm,
          CASE
            WHEN COL_LENGTH('dbo.Scan_Reporte', 'MargenInfMm') IS NOT NULL THEN MargenInfMm
            WHEN COL_LENGTH('dbo.Scan_Reporte', 'MargenInf') IS NOT NULL THEN MargenInf
            ELSE 0
          END AS MargenInfMm,
          Activo,
          EsPredeterminado,
          FechaAlta,
          FechaModificacion
        FROM dbo.Scan_Reporte
        ORDER BY
          CASE WHEN ISNULL(EsPredeterminado, 0) = 1 THEN 0 ELSE 1 END,
          CASE WHEN ISNULL(Activo, 1) = 1 THEN 0 ELSE 1 END,
          ISNULL(FechaModificacion, FechaAlta) DESC,
          IdReporte ASC
      `),
    );

    const detailRows = readRows(
      await executeSql(`
        SELECT
          IdDetalle,
          IdReporte,
          TipoElemento,
          Campo,
          TextoFijo,
          X,
          Y,
          Ancho,
          Alto,
          TamanoFuente,
          Negrita,
          Alineacion,
          Visible,
          Orden,
          MaxLineas,
          Mayuscula,
          FechaModificacion,
          TipoFuente,
          Italica
        FROM dbo.Scan_ReporteDetalle
        ORDER BY IdReporte ASC, Orden ASC, IdDetalle ASC
      `),
    );

    const byReportId = new Map();
    const orderedReports = headerRows.map((row) => {
      const normalized = normalizeHeaderRow(row);
      byReportId.set(normalized.IdReporte, {
        ...normalized,
        details: [],
        elements: [],
        __source: "SQL",
      });
      return byReportId.get(normalized.IdReporte);
    });

    for (let index = 0; index < detailRows.length; index += 1) {
      const detail = normalizeDetailRow(detailRows[index]);
      const report = byReportId.get(detail.IdReporte);
      if (report) {
        report.details.push(detail);
      }
    }

    orderedReports.forEach((report) => {
      report.details.sort(
        (a, b) =>
          a.Orden - b.Orden ||
          a.Y - b.Y ||
          a.X - b.X ||
          a.IdDetalle - b.IdDetalle,
      );
      report.elements = report.details;
    });

    return orderedReports;
  } finally {
    if (connected) {
      await closeScanSql();
    }
  }
};

const saveReportsToLocal = async (reports = []) => {
  await ensureLocalSchema();
  const normalizedReports = Array.isArray(reports) ? reports : [];

  await runLocalTransaction(async (tx) => {
    await tx.executeSql(`DELETE FROM Scan_ReporteDetalle`);
    await tx.executeSql(`DELETE FROM Scan_Reporte`);

    for (let i = 0; i < normalizedReports.length; i += 1) {
      const report = normalizedReports[i] || {};
      const header = normalizeHeaderRow(report);
      await tx.executeSql(
        `
          INSERT INTO Scan_Reporte (
            IdReporte, Codigo, Nombre, Descripcion, AnchoPapelMm, AltoMm, MargenIzq, MargenSub, MargenDer, MargenInf, MargenIzqMm, MargenSupMm, MargenDerMm, MargenInfMm, Activo, EsPredeterminado, FechaAlta, FechaModificacion
          ) VALUES (
            ${header.IdReporte || i + 1},
            ${sqlValue(header.Codigo)},
            ${sqlValue(header.Nombre)},
            ${sqlValue(header.Descripcion)},
            ${sqlValue(header.AnchoPapelMm)},
            ${sqlValue(header.AltoMm)},
            ${sqlValue(header.MargenIzq)},
            ${sqlValue(header.MargenSub)},
            ${sqlValue(header.MargenDer)},
            ${sqlValue(header.MargenInf)},
            ${sqlValue(header.MargenIzqMm)},
            ${sqlValue(header.MargenSupMm)},
            ${sqlValue(header.MargenDerMm)},
            ${sqlValue(header.MargenInfMm)},
            ${header.Activo ? 1 : 0},
            ${header.EsPredeterminado ? 1 : 0},
            ${sqlValue(header.FechaAlta)},
            ${sqlValue(header.FechaModificacion)}
          )
        `,
      );

      const details = Array.isArray(report.details)
        ? report.details
        : Array.isArray(report.elements)
          ? report.elements
          : [];

      for (
        let detailIndex = 0;
        detailIndex < details.length;
        detailIndex += 1
      ) {
        const detail = normalizeDetailRow(details[detailIndex]);
        await tx.executeSql(
          `
            INSERT INTO Scan_ReporteDetalle (
              IdDetalle, IdReporte, TipoElemento, Campo, TextoFijo, X, Y, Ancho, Alto,
              TamanoFuente, Negrita, Alineacion, Visible, Orden, MaxLineas, Mayuscula,
              FechaModificacion, TipoFuente, Italica
            ) VALUES (
              ${detail.IdDetalle || (header.IdReporte || i + 1) * 1000 + detailIndex + 1},
              ${header.IdReporte || i + 1},
              ${sqlValue(detail.TipoElemento)},
              ${sqlValue(detail.Campo)},
              ${sqlValue(detail.TextoFijo)},
              ${detail.X},
              ${detail.Y},
              ${detail.Ancho},
              ${detail.Alto},
              ${detail.TamanoFuente},
              ${detail.Negrita ? 1 : 0},
              ${sqlValue(detail.Alineacion)},
              ${detail.Visible ? 1 : 0},
              ${detail.Orden},
              ${detail.MaxLineas},
              ${detail.Mayuscula ? 1 : 0},
              ${sqlValue(detail.FechaModificacion)},
              ${sqlValue(detail.TipoFuente)},
              ${detail.Italica ? 1 : 0}
            )
          `,
        );
      }
    }
  });
};

export const loadScanReportsFromLocal = async () => {
  await ensureLocalSchema();
  const headerRows = readRows(
    await runLocalQuery(`
      SELECT
        IdReporte,
        Codigo,
        Nombre,
        Descripcion,
        AnchoPapelMm,
        AltoMm,
        MargenIzq,
        MargenSub,
        MargenDer,
        MargenInf,
        MargenIzqMm,
        MargenSupMm,
        MargenDerMm,
        MargenInfMm,
        Activo,
        EsPredeterminado,
        FechaAlta,
        FechaModificacion
      FROM Scan_Reporte
      ORDER BY
        CASE WHEN IFNULL(EsPredeterminado, 0) = 1 THEN 0 ELSE 1 END,
        CASE WHEN IFNULL(Activo, 1) = 1 THEN 0 ELSE 1 END,
        COALESCE(FechaModificacion, FechaAlta) DESC,
        IdReporte ASC
    `),
  );
  const detailRows = readRows(
    await runLocalQuery(`
      SELECT
        IdDetalle,
        IdReporte,
        TipoElemento,
        Campo,
        TextoFijo,
        X,
        Y,
        Ancho,
        Alto,
        TamanoFuente,
        Negrita,
        Alineacion,
        Visible,
        Orden,
        MaxLineas,
        Mayuscula,
        FechaModificacion,
        TipoFuente,
        Italica
      FROM Scan_ReporteDetalle
      ORDER BY IdReporte ASC, Orden ASC, IdDetalle ASC
    `),
  );

  const byReportId = new Map();
  const reports = headerRows.map((row) => {
    const normalized = normalizeHeaderRow(row);
    const report = {
      ...normalized,
      details: [],
      elements: [],
      __source: "SQL",
    };
    byReportId.set(report.IdReporte, report);
    return report;
  });

  for (let index = 0; index < detailRows.length; index += 1) {
    const detail = normalizeDetailRow(detailRows[index]);
    const report = byReportId.get(detail.IdReporte);
    if (report) {
      report.details.push(detail);
    }
  }

  reports.forEach((report) => {
    report.details.sort(
      (a, b) =>
        a.Orden - b.Orden ||
        a.Y - b.Y ||
        a.X - b.X ||
        a.IdDetalle - b.IdDetalle,
    );
    report.elements = report.details;
  });

  return reports;
};

export const getDefaultScanReportFromLocal = async () => {
  return getCachedDefaultScanReport();
};

export const getScanReportSyncSummary = async () => {
  const reports = scanReportCache.loadedAt
    ? getCachedScanReports()
    : await loadScanReportsFromLocal();
  const activeReports = reports.filter((report) => report.Activo === 1);
  const activeDetails = activeReports.reduce(
    (total, report) =>
      total + (Array.isArray(report.details) ? report.details.length : 0),
    0,
  );
  const defaultReport =
    activeReports.find((report) => report.EsPredeterminado === 1) ||
    activeReports[0] ||
    null;

  return {
    reportsCount: reports.length,
    activeReportsCount: activeReports.length,
    detailsCount: reports.reduce(
      (total, report) =>
        total + (Array.isArray(report.details) ? report.details.length : 0),
      0,
    ),
    activeDetailsCount: activeDetails,
    hasDefault: Boolean(defaultReport),
    defaultReport,
  };
};

export const syncScanReportsFromSql = async () => {
  if (scanReportSyncPromise) {
    return scanReportSyncPromise;
  }

  scanReportSyncPromise = (async () => {
    const reports = await fetchSqlReports();
    await saveReportsToLocal(reports);
    setScanReportCache(reports);

    const activeReports = reports.filter((report) => report.Activo === 1);
    const activePred = activeReports.filter(
      (report) => report.EsPredeterminado === 1,
    );
    if (activePred.length > 1 && __DEV__) {
      console.warn(
        "[SCAN_REPORT] multiple default templates found during sync",
        activePred.map((report) => report.Codigo),
      );
    }
    const activeDetails = activeReports.reduce(
      (total, report) =>
        total + (Array.isArray(report.details) ? report.details.length : 0),
      0,
    );
    const defaultReport = activePred[0] || activeReports[0] || null;

    return {
      reportsCount: reports.length,
      activeReportsCount: activeReports.length,
      detailsCount: reports.reduce(
        (total, report) =>
          total + (Array.isArray(report.details) ? report.details.length : 0),
        0,
      ),
      activeDetailsCount: activeDetails,
      hasDefault: Boolean(defaultReport),
      defaultReport,
    };
  })();

  try {
    return await scanReportSyncPromise;
  } finally {
    scanReportSyncPromise = null;
  }
};

export const getDefaultScanReportTemplate = async ({
  forceRefresh = false,
} = {}) => {
  if (forceRefresh) {
    await refreshScanReportCache().catch(() => null);
  }

  const report = await getCachedDefaultScanReport({ forceRefresh });
  if (!report) {
    return null;
  }

  const paperWidthMm =
    Number(report.AnchoPapelMm ?? report.anchoPapelMm ?? 0) || 0;
  const paperHeightMm = Number(report.AltoMm ?? report.altoMm ?? 0) || 0;

  return {
    ...report,
    paperWidth:
      paperWidthMm === 58 || paperWidthMm === 80
        ? String(paperWidthMm)
        : "custom",
    customPaperWidth:
      paperWidthMm > 0 && paperWidthMm !== 58 && paperWidthMm !== 80
        ? String(paperWidthMm)
        : "",
    paperHeight: paperHeightMm > 0 ? "custom" : "auto",
    customPaperHeight: paperHeightMm > 0 ? String(paperHeightMm) : "",
    marginLeft: String(
      Number(report.MargenIzq ?? report.MargenIzqMm ?? report.margenIzq ?? 0) ||
        0,
    ),
    marginTop: String(
      Number(report.MargenSub ?? report.MargenSupMm ?? report.margenSub ?? 0) ||
        0,
    ),
    marginRight: String(
      Number(report.MargenDer ?? report.MargenDerMm ?? report.margenDer ?? 0) ||
        0,
    ),
    marginBottom: String(
      Number(report.MargenInf ?? report.MargenInfMm ?? report.margenInf ?? 0) ||
        0,
    ),
    elements: Array.isArray(report.details)
      ? report.details
      : report.elements || [],
    __source: "SQL",
  };
};
