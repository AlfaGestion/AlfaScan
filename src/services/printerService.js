import { getPrinterStatus, initPrinter, printLabel } from "@services/sunmiPrinterService";
import { loadPrintFormats, PRINT_FORMAT_KEYS } from "@services/printFormats";

export const printArticle = async ({ article, formatKey = "product", format = null } = {}) => {
  if (!article) {
    throw new Error("Buscá un artículo antes de imprimir.");
  }

  const normalizedKey = String(formatKey ?? "product").trim().toLowerCase();
  const status = await initPrinter();
  const printerAvailable = Boolean(status?.available ?? getPrinterStatus().available);

  console.log("[PRINT] format", normalizedKey);
  console.log("[PRINT] printer available", printerAvailable);
  console.log("[PRINT] printing", article);

  if (!printerAvailable) {
    throw new Error(status?.message || "No se pudo conectar con la impresora.");
  }

  let resolvedFormat = format;
  if (!resolvedFormat) {
    const formats = await loadPrintFormats();
    resolvedFormat =
      formats?.[normalizedKey] ||
      formats?.[formatKey] ||
      formats?.[PRINT_FORMAT_KEYS[1]] ||
      formats?.[PRINT_FORMAT_KEYS[0]];
  }

  return printLabel(resolvedFormat, article);
};
