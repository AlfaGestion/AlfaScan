import SQLite from "@db/SQLiteCompat";
import { BaseModel, types } from "expo-sqlite-orm";
import CatalogService from "@services/catalogService";

export default class Product extends BaseModel {
  constructor(obj) {
    super(obj);
  }

  static get database() {
    return async () => SQLite.openDatabase("AlfaScan.db");
  }

  static get tableName() {
    return "products";
  }

  static get columnMapping() {
    return {
      id: { type: types.INTEGER, primary_key: true },
      code: { type: types.TEXT },
      codigoArticulo: { type: types.TEXT },
      codigoBarras: { type: types.TEXT },
      codigoBarra: { type: types.TEXT },
      codigoBarra1: { type: types.TEXT },
      codigoBarra2: { type: types.TEXT },
      codigoBarra3: { type: types.TEXT },
      codigoBarra4: { type: types.TEXT },
      codigoBarraDun: { type: types.TEXT },
      name: { type: types.TEXT },
      descripcion: { type: types.TEXT },
      category: { type: types.TEXT },
      family: { type: types.TEXT },
      iva: { type: types.NUMERIC },
      internal_taxes: { type: types.NUMERIC },
      cant_propuesta: { type: types.NUMERIC },
      exempt: { type: types.NUMERIC },
      precio: { type: types.NUMERIC },
      stock: { type: types.NUMERIC },
      fechaActualizacion: { type: types.TEXT },
      price1: { type: types.NUMERIC },
      price2: { type: types.NUMERIC },
      price3: { type: types.NUMERIC },
      price4: { type: types.NUMERIC },
      price5: { type: types.NUMERIC },
      price6: { type: types.NUMERIC },
      price7: { type: types.NUMERIC },
      price8: { type: types.NUMERIC },
      price9: { type: types.NUMERIC },
      price10: { type: types.NUMERIC },
    };
  }

  static maskStockRows(rows, useStockColumn = true) {
    const safeRows = Array.isArray(rows) ? rows : [];
    if (useStockColumn) {
      return safeRows;
    }

    return safeRows.map((row) => ({
      ...row,
      stock: null,
    }));
  }

  static async query(options = {}) {
    const config = await CatalogService.getCatalogConfig();
    if (config.mode === "ONLINE") {
      const page = options?.page ?? 1;
      const limit = options?.limit ?? 20;
      const priceClass = options?.priceClass ?? options?.classPrice ?? 1;
      const rows = await CatalogService.queryCatalogPage({
        searchText: "",
        page,
        limit,
        priceClass,
      });
      return Product.maskStockRows(rows, config.useStockColumn);
    }

    const rows = await super.query(options);
    return Product.maskStockRows(rows, config.useStockColumn);
  }

  static async findLikeName(name, classPrice = 1, limit = 20, lista = '') {
    const config = await CatalogService.getCatalogConfig();
    if (config.mode === "ONLINE") {
      const rows = await CatalogService.findCatalogLikeName({
        name,
        classPrice,
        limit,
        page: 1,
      });
      return Product.maskStockRows(rows, config.useStockColumn);
    }

    const page = 1;
    const search = String(name ?? "").toLowerCase();
    const searchLike = `%${search}%`;
    let sql;
    if (lista == '' || lista == null || lista == undefined) {
      sql = `Select cant_propuesta, code, codigoArticulo, codigoBarras, codigoBarra, codigoBarra1, codigoBarra2, codigoBarra3, codigoBarra4, codigoBarraDun, name, descripcion, precio, stock, fechaActualizacion, id, price${classPrice} from products
    where (lower(name) like ? or lower(code) like ? or lower(codigoBarras) like ? or lower(codigoBarra1) like ? or lower(codigoBarra2) like ? or lower(codigoBarra3) like ? or lower(codigoBarra4) like ? or lower(codigoBarraDun) like ?)
    order by name ASC limit ${limit} offset ${(page - 1) * limit}`;
    } else {
      sql = `Select cant_propuesta, code, codigoArticulo, codigoBarras, codigoBarra, codigoBarra1, codigoBarra2, codigoBarra3, codigoBarra4, codigoBarraDun, name, descripcion, precio, stock, fechaActualizacion, id, price${classPrice} from products_listas
    where lista='${lista}' and (lower(name) like ? or lower(code) like ? or lower(codigoBarras) like ? or lower(codigoBarra1) like ? or lower(codigoBarra2) like ? or lower(codigoBarra3) like ? or lower(codigoBarra4) like ? or lower(codigoBarraDun) like ?)
    order by name ASC limit ${limit} offset ${(page - 1) * limit}`;
    }
    const rows = await this.repository.databaseLayer.executeSql(sql, [searchLike, searchLike, searchLike, searchLike, searchLike, searchLike, searchLike, searchLike]).then(({ rows }) => rows);
    return Product.maskStockRows(rows, config.useStockColumn);
  }

  static async findByCode(code, lista = '') {
    const config = await CatalogService.getCatalogConfig();
    if (config.mode === "ONLINE") {
      const rows = await CatalogService.findCatalogByCode({
        code,
        classPrice: 1,
      });
      return Product.maskStockRows(rows, config.useStockColumn);
    }

    const rawCode = String(code ?? "").trim();
    const searchCode = rawCode;
    const searchCodeLower = rawCode.toLowerCase();
    const normalizedCode = rawCode.replace(/\s+/g, "").replace(/[^0-9a-z]/gi, "");
    const normalizedCodeLower = normalizedCode.toLowerCase();
    if (!searchCode) return [];

    const select = `SELECT cant_propuesta, code, codigoArticulo, codigoBarras, codigoBarra, codigoBarra1, codigoBarra2, codigoBarra3, codigoBarra4, codigoBarraDun, name, descripcion, precio, stock, fechaActualizacion, id, price1, price2, price3, price4, price5, price6, price7, price8, price9, price10`;
    const barcodeWhere = `(
      lower(trim(code)) = ? OR lower(replace(trim(code), ' ', '')) = ? OR
      lower(trim(codigoBarras)) = ? OR lower(replace(trim(codigoBarras), ' ', '')) = ? OR
      lower(trim(codigoBarra1)) = ? OR lower(replace(trim(codigoBarra1), ' ', '')) = ? OR
      lower(trim(codigoBarra2)) = ? OR lower(replace(trim(codigoBarra2), ' ', '')) = ? OR
      lower(trim(codigoBarra3)) = ? OR lower(replace(trim(codigoBarra3), ' ', '')) = ? OR
      lower(trim(codigoBarra4)) = ? OR lower(replace(trim(codigoBarra4), ' ', '')) = ? OR
      lower(trim(codigoBarraDun)) = ? OR lower(replace(trim(codigoBarraDun), ' ', '')) = ?
    )`;

    if (lista != '' && lista != null && lista != undefined) {
      const sqlListas = `
        ${select}
        FROM products_listas
        WHERE lista=? AND ${barcodeWhere}
        ORDER BY name ASC LIMIT 1`;

      let rowsListas = await this.repository.databaseLayer.executeSql(sqlListas, [lista, searchCodeLower, normalizedCodeLower, searchCodeLower, normalizedCodeLower, searchCodeLower, normalizedCodeLower, searchCodeLower, normalizedCodeLower, searchCodeLower, normalizedCodeLower, searchCodeLower, normalizedCodeLower, searchCodeLower, normalizedCodeLower]).then(({ rows }) => rows);
      if (rowsListas && rowsListas.length > 0) {
        return Product.maskStockRows(rowsListas, config.useStockColumn);
      }

      if (normalizedCode && normalizedCode !== searchCode) {
        const sqlListasNorm = `
          ${select}
          FROM products_listas
          WHERE lista=? AND (
            replace(replace(codigoBarras,'-',''),' ','') = ? OR
            replace(replace(codigoBarra1,'-',''),' ','') = ? OR
            replace(replace(codigoBarra2,'-',''),' ','') = ? OR
            replace(replace(codigoBarra3,'-',''),' ','') = ? OR
            replace(replace(codigoBarra4,'-',''),' ','') = ? OR
            replace(replace(codigoBarraDun,'-',''),' ','') = ?
          )
          ORDER BY name ASC LIMIT 1`;
        rowsListas = await this.repository.databaseLayer.executeSql(sqlListasNorm, [lista, normalizedCode, normalizedCode, normalizedCode, normalizedCode, normalizedCode, normalizedCode]).then(({ rows }) => rows);
        if (rowsListas && rowsListas.length > 0) {
          return Product.maskStockRows(rowsListas, config.useStockColumn);
        }
      }
    }

    const sql = `
      ${select}
      FROM products
      WHERE ${barcodeWhere}
      ORDER BY name ASC LIMIT 1`;

    let rows = await this.repository.databaseLayer.executeSql(sql, [searchCodeLower, normalizedCodeLower, searchCodeLower, normalizedCodeLower, searchCodeLower, normalizedCodeLower, searchCodeLower, normalizedCodeLower, searchCodeLower, normalizedCodeLower, searchCodeLower, normalizedCodeLower, searchCodeLower, normalizedCodeLower]).then(({ rows }) => rows);
    if (rows && rows.length > 0) {
      return Product.maskStockRows(rows, config.useStockColumn);
    }

    if (normalizedCode && normalizedCode !== searchCode) {
      const sqlNorm = `
        ${select}
        FROM products
        WHERE (
          replace(replace(codigoBarras,'-',''),' ','') = ? OR
          replace(replace(codigoBarra1,'-',''),' ','') = ? OR
          replace(replace(codigoBarra2,'-',''),' ','') = ? OR
          replace(replace(codigoBarra3,'-',''),' ','') = ? OR
          replace(replace(codigoBarra4,'-',''),' ','') = ? OR
          replace(replace(codigoBarraDun,'-',''),' ','') = ?
        )
        ORDER BY name ASC LIMIT 1`;
      rows = await this.repository.databaseLayer.executeSql(sqlNorm, [normalizedCode, normalizedCode, normalizedCode, normalizedCode, normalizedCode, normalizedCode]).then(({ rows }) => rows);
      if (rows && rows.length > 0) {
        return Product.maskStockRows(rows, config.useStockColumn);
      }
    }

    return [];
  }

  static async findByBarcodeExact(barcode, lista = '') {
    const config = await CatalogService.getCatalogConfig();
    if (config.mode === "ONLINE") {
      const rows = await CatalogService.findCatalogByBarcodeExact({
        barcode,
        classPrice: 1,
      });
      if (rows && rows.length > 0) {
        return Product.maskStockRows(rows, config.useStockColumn);
      }

      const fallbackRows = await CatalogService.findCatalogByCode({
        code: barcode,
        classPrice: 1,
      });
      return Product.maskStockRows(fallbackRows, config.useStockColumn);
    }

    return Product.findByBarcodeExactLocal(barcode, lista);
  }

  static async findByBarcodeExactLocal(barcode, lista = '') {
    const config = await CatalogService.getCatalogConfig();
    const rawBarcode = String(barcode ?? "").trim();
    const normalizedBarcode = rawBarcode.replace(/\s+/g, "").replace(/[^0-9a-z]/gi, "").toLowerCase();
    if (!rawBarcode) return [];

    const select = `SELECT cant_propuesta, code, codigoArticulo, codigoBarras, codigoBarra, codigoBarra1, codigoBarra2, codigoBarra3, codigoBarra4, codigoBarraDun, name, descripcion, precio, stock, fechaActualizacion, id, price1, price2, price3, price4, price5, price6, price7, price8, price9, price10`;
    const barcodeWhere = `(
      lower(trim(codigoBarras)) = ? OR lower(replace(trim(codigoBarras), ' ', '')) = ? OR
      lower(trim(codigoBarra)) = ? OR lower(replace(trim(codigoBarra), ' ', '')) = ? OR
      lower(trim(codigoBarra1)) = ? OR lower(replace(trim(codigoBarra1), ' ', '')) = ? OR
      lower(trim(codigoBarra2)) = ? OR lower(replace(trim(codigoBarra2), ' ', '')) = ? OR
      lower(trim(codigoBarra3)) = ? OR lower(replace(trim(codigoBarra3), ' ', '')) = ? OR
      lower(trim(codigoBarra4)) = ? OR lower(replace(trim(codigoBarra4), ' ', '')) = ? OR
      lower(trim(codigoBarraDun)) = ? OR lower(replace(trim(codigoBarraDun), ' ', '')) = ?
    )`;

    if (lista != '' && lista != null && lista != undefined) {
      const sqlListas = `
        ${select}
        FROM products_listas
        WHERE lista=? AND ${barcodeWhere}
        ORDER BY name ASC LIMIT 1`;

      let rowsListas = await this.repository.databaseLayer.executeSql(sqlListas, [lista, rawBarcode.toLowerCase(), normalizedBarcode, rawBarcode.toLowerCase(), normalizedBarcode, rawBarcode.toLowerCase(), normalizedBarcode, rawBarcode.toLowerCase(), normalizedBarcode, rawBarcode.toLowerCase(), normalizedBarcode, rawBarcode.toLowerCase(), normalizedBarcode, rawBarcode.toLowerCase(), normalizedBarcode]).then(({ rows }) => rows);
      if (rowsListas && rowsListas.length > 0) {
        return Product.maskStockRows(rowsListas, config.useStockColumn);
      }
    }

    const sql = `
      ${select}
      FROM products
      WHERE ${barcodeWhere}
      ORDER BY name ASC LIMIT 1`;

    const rows = await this.repository.databaseLayer.executeSql(sql, [rawBarcode.toLowerCase(), normalizedBarcode, rawBarcode.toLowerCase(), normalizedBarcode, rawBarcode.toLowerCase(), normalizedBarcode, rawBarcode.toLowerCase(), normalizedBarcode, rawBarcode.toLowerCase(), normalizedBarcode, rawBarcode.toLowerCase(), normalizedBarcode, rawBarcode.toLowerCase(), normalizedBarcode]).then(({ rows }) => rows);
    if (rows && rows.length > 0) {
      return Product.maskStockRows(rows, config.useStockColumn);
    }

    return [];
  }

  static async ensureIndexes() {
    const sqls = [
      "CREATE INDEX IF NOT EXISTS idx_products_code ON products(code)",
      "CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(codigoBarras)",
      "CREATE INDEX IF NOT EXISTS idx_products_codigobarra ON products(codigoBarra)",
      "CREATE INDEX IF NOT EXISTS idx_products_barcode1 ON products(codigoBarra1)",
      "CREATE INDEX IF NOT EXISTS idx_products_barcode2 ON products(codigoBarra2)",
      "CREATE INDEX IF NOT EXISTS idx_products_barcode3 ON products(codigoBarra3)",
      "CREATE INDEX IF NOT EXISTS idx_products_barcode4 ON products(codigoBarra4)",
      "CREATE INDEX IF NOT EXISTS idx_products_barcodedun ON products(codigoBarraDun)",
      "CREATE INDEX IF NOT EXISTS idx_products_listas_lista_code ON products_listas(lista, code)",
      "CREATE INDEX IF NOT EXISTS idx_products_listas_lista_barcode ON products_listas(lista, codigoBarras)",
      "CREATE INDEX IF NOT EXISTS idx_products_listas_lista_codigobarra ON products_listas(lista, codigoBarra)",
      "CREATE INDEX IF NOT EXISTS idx_products_listas_lista_barcode1 ON products_listas(lista, codigoBarra1)",
      "CREATE INDEX IF NOT EXISTS idx_products_listas_lista_barcode2 ON products_listas(lista, codigoBarra2)",
      "CREATE INDEX IF NOT EXISTS idx_products_listas_lista_barcode3 ON products_listas(lista, codigoBarra3)",
      "CREATE INDEX IF NOT EXISTS idx_products_listas_lista_barcode4 ON products_listas(lista, codigoBarra4)",
      "CREATE INDEX IF NOT EXISTS idx_products_listas_lista_barcodedun ON products_listas(lista, codigoBarraDun)",
    ];

    for (const sql of sqls) {
      try {
        await this.repository.databaseLayer.executeSql(sql, []);
      } catch (e) {
        // ignore index errors to avoid blocking UI
      }
    }
  }

  static async findByCodes(codes = [], lista = '') {
    const config = await CatalogService.getCatalogConfig();
    if (config.mode === "ONLINE") {
      const rows = await CatalogService.findCatalogByCodes({
        codes,
        classPrice: 1,
      });
      return Product.maskStockRows(rows, config.useStockColumn);
    }

    const rawCodes = Array.from(new Set((codes || []).map(c => String(c ?? "").trim()).filter(Boolean)));
    if (rawCodes.length === 0) return [];

    const normalizedCodes = Array.from(new Set(rawCodes.map(c => c.replace(/\s+/g, "").replace(/[^0-9a-z]/gi, ""))));

    const select = `SELECT cant_propuesta, code, codigoArticulo, codigoBarras, codigoBarra, codigoBarra1, codigoBarra2, codigoBarra3, codigoBarra4, codigoBarraDun, name, descripcion, precio, stock, fechaActualizacion, id, price1, price2, price3, price4, price5, price6, price7, price8, price9, price10`;
    const inRaw = rawCodes.map(() => "?").join(",");

    const exactWhere = `(
      trim(code) IN (${inRaw}) OR replace(trim(code), ' ', '') IN (${inRaw}) OR
      trim(codigoBarras) IN (${inRaw}) OR replace(trim(codigoBarras), ' ', '') IN (${inRaw}) OR
      trim(codigoBarra1) IN (${inRaw}) OR replace(trim(codigoBarra1), ' ', '') IN (${inRaw}) OR
      trim(codigoBarra2) IN (${inRaw}) OR replace(trim(codigoBarra2), ' ', '') IN (${inRaw}) OR
      trim(codigoBarra3) IN (${inRaw}) OR replace(trim(codigoBarra3), ' ', '') IN (${inRaw}) OR
      trim(codigoBarra4) IN (${inRaw}) OR replace(trim(codigoBarra4), ' ', '') IN (${inRaw}) OR
      trim(codigoBarraDun) IN (${inRaw}) OR replace(trim(codigoBarraDun), ' ', '') IN (${inRaw})
    )`;

    if (lista != '' && lista != null && lista != undefined) {
      const sqlListas = `
        ${select}
        FROM products_listas
        WHERE lista=? AND ${exactWhere}
      `;
      const paramsListas = [String(lista), ...rawCodes, ...normalizedCodes, ...rawCodes, ...normalizedCodes, ...rawCodes, ...normalizedCodes, ...rawCodes, ...normalizedCodes, ...rawCodes, ...normalizedCodes, ...rawCodes, ...normalizedCodes, ...rawCodes, ...normalizedCodes];
      let rows = await this.repository.databaseLayer.executeSql(sqlListas, paramsListas).then(({ rows }) => rows);

      // Si hay códigos con normalización distinta, buscamos solo esos faltantes
      const normalize = (c) => String(c ?? "").replace(/[^0-9a-z]/gi, "");
      const foundSet = new Set((rows || []).flatMap(r => [normalize(r.code), normalize(r.codigoBarras), normalize(r.codigoBarra1), normalize(r.codigoBarra2), normalize(r.codigoBarra3), normalize(r.codigoBarra4), normalize(r.codigoBarraDun)]));
      const normMissing = normalizedCodes.filter(n => n && !foundSet.has(n) && !rawCodes.includes(n));

      if (normMissing.length > 0) {
        const inNorm = normMissing.map(() => "?").join(",");
        const sqlListasNorm = `
          ${select}
          FROM products_listas
          WHERE lista=? AND (
            replace(replace(codigoBarras,'-',''),' ','') IN (${inNorm}) OR
            replace(replace(codigoBarra1,'-',''),' ','') IN (${inNorm}) OR
            replace(replace(codigoBarra2,'-',''),' ','') IN (${inNorm}) OR
            replace(replace(codigoBarra3,'-',''),' ','') IN (${inNorm}) OR
            replace(replace(codigoBarra4,'-',''),' ','') IN (${inNorm}) OR
            replace(replace(codigoBarraDun,'-',''),' ','') IN (${inNorm})
          )
        `;
        const rowsNorm = await this.repository.databaseLayer.executeSql(sqlListasNorm, [String(lista), ...normMissing, ...normMissing, ...normMissing, ...normMissing, ...normMissing, ...normMissing]).then(({ rows }) => rows);
        rows = [...(rows || []), ...(rowsNorm || [])];
      }

      return Product.maskStockRows(rows || [], config.useStockColumn);
    }

    const sql = `
      ${select}
      FROM products
      WHERE ${exactWhere}
    `;
    let rows = await this.repository.databaseLayer.executeSql(sql, [...rawCodes, ...normalizedCodes, ...rawCodes, ...normalizedCodes, ...rawCodes, ...normalizedCodes, ...rawCodes, ...normalizedCodes, ...rawCodes, ...normalizedCodes, ...rawCodes, ...normalizedCodes, ...rawCodes, ...normalizedCodes]).then(({ rows }) => rows);

    const normalize = (c) => String(c ?? "").replace(/[^0-9a-z]/gi, "");
    const foundSet = new Set((rows || []).flatMap(r => [normalize(r.code), normalize(r.codigoBarras), normalize(r.codigoBarra1), normalize(r.codigoBarra2), normalize(r.codigoBarra3), normalize(r.codigoBarra4), normalize(r.codigoBarraDun)]));
    const normMissing = normalizedCodes.filter(n => n && !foundSet.has(n) && !rawCodes.includes(n));
    if (normMissing.length > 0) {
      const inNorm = normMissing.map(() => "?").join(",");
      const sqlNorm = `
        ${select}
        FROM products
        WHERE (
          replace(replace(codigoBarras,'-',''),' ','') IN (${inNorm}) OR
          replace(replace(codigoBarra1,'-',''),' ','') IN (${inNorm}) OR
          replace(replace(codigoBarra2,'-',''),' ','') IN (${inNorm}) OR
          replace(replace(codigoBarra3,'-',''),' ','') IN (${inNorm}) OR
          replace(replace(codigoBarra4,'-',''),' ','') IN (${inNorm}) OR
          replace(replace(codigoBarraDun,'-',''),' ','') IN (${inNorm})
        )
      `;
      const rowsNorm = await this.repository.databaseLayer.executeSql(sqlNorm, [...normMissing, ...normMissing, ...normMissing, ...normMissing, ...normMissing, ...normMissing]).then(({ rows }) => rows);
      rows = [...(rows || []), ...(rowsNorm || [])];
    }

    return Product.maskStockRows(rows || [], config.useStockColumn);
  }

  static async findByBarcodePrefix(scannedCode, lista = '') {
    const config = await CatalogService.getCatalogConfig();
    if (config.mode === "ONLINE") {
      const rows = await CatalogService.findCatalogByBarcodePrefix({
        scannedCode,
        classPrice: 1,
      });
      return Product.maskStockRows(rows, config.useStockColumn);
    }

    const rawCode = String(scannedCode ?? "").trim();
    const normalizedCode = rawCode.replace(/\s+/g, "").replace(/[^0-9a-z]/gi, "");
    if (!normalizedCode) return [];

    const select = `SELECT cant_propuesta, code, codigoArticulo, codigoBarras, codigoBarra, codigoBarra1, codigoBarra2, codigoBarra3, codigoBarra4, codigoBarraDun, name, descripcion, precio, stock, fechaActualizacion, id, price1, price2, price3, price4, price5, price6, price7, price8, price9, price10`;
    const prefixWhere = `(
      ? LIKE replace(trim(code), ' ', '') || '%' OR
      ? LIKE replace(trim(codigoBarras), ' ', '') || '%' OR
      ? LIKE replace(trim(codigoBarra1), ' ', '') || '%' OR
      ? LIKE replace(trim(codigoBarra2), ' ', '') || '%' OR
      ? LIKE replace(trim(codigoBarra3), ' ', '') || '%' OR
      ? LIKE replace(trim(codigoBarra4), ' ', '') || '%' OR
      ? LIKE replace(trim(codigoBarraDun), ' ', '') || '%'
    )`;

    if (lista != '' && lista != null && lista != undefined) {
      const sqlListas = `
        ${select}
        FROM products_listas
        WHERE lista=? AND ${prefixWhere}
      `;
      const rows = await this.repository.databaseLayer.executeSql(sqlListas, [String(lista), normalizedCode, normalizedCode, normalizedCode, normalizedCode, normalizedCode, normalizedCode, normalizedCode]).then(({ rows }) => rows);
      return Product.maskStockRows(rows, config.useStockColumn);
    }

    const sql = `
      ${select}
      FROM products
      WHERE ${prefixWhere}
    `;
    const rows = await this.repository.databaseLayer.executeSql(sql, [normalizedCode, normalizedCode, normalizedCode, normalizedCode, normalizedCode, normalizedCode, normalizedCode]).then(({ rows }) => rows);
    return Product.maskStockRows(rows, config.useStockColumn);
  }

  static async ensureBarcodeColumns() {
    const sqls = [
      "ALTER TABLE products ADD COLUMN codigoBarra1 TEXT",
      "ALTER TABLE products ADD COLUMN codigoBarra2 TEXT",
      "ALTER TABLE products ADD COLUMN codigoBarra3 TEXT",
      "ALTER TABLE products ADD COLUMN codigoBarra4 TEXT",
      "ALTER TABLE products ADD COLUMN codigoBarraDun TEXT",
    ];

    for (const sql of sqls) {
      try {
        await this.repository.databaseLayer.executeSql(sql, []);
      } catch (e) {
        // ignore if column already exists
      }
    }
  }
}
