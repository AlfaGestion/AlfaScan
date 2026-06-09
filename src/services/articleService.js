import Product from "@db/Product";
import Article from "@models/Article";
import CatalogService from "@services/catalogService";

let barcodeIndexesPromise = null;

export const normalizeArticle = (row = {}) => {
  return new Article(row);
};

const ensureBarcodeIndexes = async () => {
  if (!barcodeIndexesPromise) {
    barcodeIndexesPromise = Product.ensureIndexes().catch((error) => {
      barcodeIndexesPromise = null;
      throw error;
    });
  }

  return barcodeIndexesPromise;
};

export const findProductByBarcodeFast = async (barcode) => {
  const searchText = String(barcode ?? "").trim();
  if (!searchText) {
    return null;
  }

  const startedAt = Date.now();
  console.log("[SEARCH] scan barcode start");

  await ensureBarcodeIndexes().catch(() => {});

  let rows = await Product.findByBarcodeExactLocal(searchText);
  let source = "sqlite";

  if (!Array.isArray(rows) || rows.length === 0) {
    const config = await CatalogService.getCatalogConfig().catch(() => null);
    if (String(config?.mode ?? "").trim().toUpperCase() === "ONLINE") {
      rows = await Product.findByBarcodeExact(searchText);
      source = "sql";
    } else {
      console.log("[SEARCH] scan source sqlite");
      console.log(`[SEARCH] scan barcode finished in ${Date.now() - startedAt} ms`);
      throw new Error("Producto no encontrado. Sincronizá productos.");
    }
  }

  console.log(`[SEARCH] scan source ${source}`);
  console.log(`[SEARCH] scan barcode finished in ${Date.now() - startedAt} ms`);

  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return normalizeArticle(rows[0]);
};

export const searchArticle = async (query) => {
  const searchText = String(query ?? "").trim();
  if (!searchText) {
    return null;
  }

  let rows = await Product.findByCode(searchText, "");
  if (!Array.isArray(rows) || rows.length === 0) {
    rows = await Product.findLikeName(searchText, 1, 20, "");
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return normalizeArticle(rows[0]);
};

export const scanSearchArticle = async (barcode) => {
  return findProductByBarcodeFast(barcode);
};

export const searchArticles = async (query, limit = 20) => {
  const searchText = String(query ?? "").trim();
  if (!searchText) {
    return [];
  }

  let rows = await Product.findLikeName(searchText, 1, limit, "");
  if (!Array.isArray(rows) || rows.length === 0) {
    rows = await Product.findByCode(searchText, "");
  }

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => normalizeArticle(row));
};
