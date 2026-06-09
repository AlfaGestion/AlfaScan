import { printLabel } from "@services/sunmiPrinterService";
import { loadPrintFormats } from "@services/printFormats";

export const printArticle = async ({ article, formatKey = "product", format = null } = {}) => {
  if (!article) {
    throw new Error("Buscá un artículo antes de imprimir.");
  }

  let resolvedFormat = format;
  if (!resolvedFormat) {
    const formats = await loadPrintFormats();
    resolvedFormat = formats.find((item) => item.key === formatKey) || formats[1] || formats[0];
  }
  return printLabel(resolvedFormat, article);
};
