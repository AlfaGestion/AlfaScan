import {
  getPrinterStatus,
  initPrinter,
  printBarcode,
  printSimpleProductLabel,
  printText,
} from "@services/sunmiPrinterService";
import { NativeModules } from "react-native";

const formatCurrency = (value) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? amount.toLocaleString("es-AR", {
        style: "currency",
        currency: "ARS",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : (0).toLocaleString("es-AR", {
        style: "currency",
        currency: "ARS",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
};

export const printArticle = async ({ article, formatKey = "product", format = null } = {}) => {
  if (!article) {
    throw new Error("Buscá un artículo antes de imprimir.");
  }

  const normalizedKey = String(formatKey ?? "product").trim().toLowerCase();
  const status = await initPrinter();
  const printerAvailable = Boolean(status?.available ?? getPrinterStatus().available);

  console.log("[PRINT] printer available", printerAvailable);

  if (!printerAvailable) {
    throw new Error(status?.message || "No se pudo conectar con la impresora.");
  }

  const diagnosticsModule = NativeModules?.SunmiDiagnostics;
  if (diagnosticsModule && typeof diagnosticsModule.printSimpleProductLabel === "function") {
    return await printSimpleProductLabel(normalizedKey, article);
  }

  console.log("[PRINT] SunmiDiagnostics not available, trying fallback");
  console.log("[PRINT] using direct Sunmi primitives");
  console.log("[PRINT] calling native Sunmi print");
  const description = String(article?.descripcion ?? article?.name ?? "").trim();
  const barcode = String(article?.codigoBarra ?? article?.codigoBarras ?? article?.code ?? "").trim();
  const internalCode = String(article?.codigoInterno ?? article?.codigoArticulo ?? article?.code ?? "").trim();
  const price = formatCurrency(article?.precio ?? article?.price1 ?? article?.price ?? 0);

  await printText("AlfaScan", { align: "center", fontSize: normalizedKey === "gondola" ? 20 : 18 });
  if (barcode) {
    await printBarcode(barcode, {
      barcodeType: "EAN13",
      height: normalizedKey === "small" ? 90 : normalizedKey === "gondola" ? 140 : 120,
      width: 2,
      showNumber: true,
    });
  }
  if (description) {
    await printText(description, {
      align: "center",
      fontSize: normalizedKey === "gondola" ? 22 : normalizedKey === "small" ? 16 : 18,
    });
  }
  if (price) {
    await printText(price, {
      align: "center",
      fontSize: normalizedKey === "gondola" ? 32 : 26,
    });
  }
  if (internalCode) {
    await printText(`Cod: ${internalCode}`, { align: "center", fontSize: 16 });
  }

  console.log("[PRINT] success");
  return { printed: true, formatKey: normalizedKey };
};
