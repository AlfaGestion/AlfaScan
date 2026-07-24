import Product from "@db/Product";
import Article from "@models/Article";

export const normalizeArticle = (row = {}) => {
  return new Article(row);
};

export const searchArticle = async (query) => {
  const searchText = String(query ?? "").trim();
  if (!searchText) {
    return null;
  }

  const looksLikeBarcode = /^[0-9A-Z]+$/i.test(searchText) && searchText.length >= 8;
  let rows = looksLikeBarcode
    ? await Product.findByBarcodeExactLocal(searchText, "")
    : [];
  if (!Array.isArray(rows) || rows.length === 0) {
    rows = await Product.findByCode(searchText, "");
  }

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
    const startedAt = __DEV__ ? Date.now() : 0;
    const rows = await Product.findByBarcodeExactLocal(searchText);
    if (__DEV__) {
      console.log("[SEARCH] scan barcode finished in", Date.now() - startedAt, "ms");
    }
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
