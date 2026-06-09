import Product from "@db/Product";
import Article from "@models/Article";
import CatalogService from "@services/catalogService";

export const normalizeArticle = (row = {}) => {
  return new Article(row);
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

export const searchProduct = async ({
  query = "",
  source = "manual",
  exactBarcode = false,
} = {}) => {
  const searchText = String(query ?? "").trim();
  if (!searchText) {
    return null;
  }

  if (source === "scan" && exactBarcode) {
    const startedAt = Date.now();
    console.log(`[SEARCH] scan barcode started ${searchText}`);
    console.log("[SEARCH] source camera");

    const config = await CatalogService.getCatalogConfig().catch(() => null);
    const mode = String(config?.mode ?? "LOCAL").trim().toUpperCase();
    const modeLabel = mode === "ONLINE" ? "sqlOnline" : "sqlLocal";
    console.log(`[SEARCH] mode ${modeLabel}`);
    console.log("[SEARCH] exact barcode lookup");

    if (mode === "ONLINE") {
      const tableName = String(config?.objectName ?? "Productos").trim() || "Productos";
      console.log(`[SEARCH] using SQL Server configured table ${tableName}`);
      const rows = await CatalogService.findCatalogByBarcodeExact({
        barcode: searchText,
        classPrice: 1,
      });
      console.log(`[SEARCH] scan barcode finished in ${Date.now() - startedAt} ms`);
      return Array.isArray(rows) && rows.length > 0 ? normalizeArticle(rows[0]) : null;
    }

    console.log("[SEARCH] using SQLite local table products");
    const rows = await Product.findByBarcodeExactLocal(searchText);
    console.log(`[SEARCH] scan barcode finished in ${Date.now() - startedAt} ms`);
    return Array.isArray(rows) && rows.length > 0 ? normalizeArticle(rows[0]) : null;
  }

  return searchArticle(searchText);
};

export const scanSearchArticle = async (barcode) => {
  return searchProduct({ query: barcode, source: "scan", exactBarcode: true });
};

export const findProductByBarcodeFast = async (barcode) => {
  return searchProduct({ query: barcode, source: "scan", exactBarcode: true });
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
