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

  let rows = await Product.findByCode(searchText, "");
  if (!Array.isArray(rows) || rows.length === 0) {
    rows = await Product.findLikeName(searchText, 1, 20, "");
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return normalizeArticle(rows[0]);
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
