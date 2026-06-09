import SunmiV2Printer from "react-native-sunmi-v2-printer";
import { loadPrintFormats } from "@services/printFormats";

const ALIGNMENT_MAP = {
  left: 0,
  center: 1,
  right: 2,
};

const isPrinterAvailable = () =>
  Boolean(SunmiV2Printer && typeof SunmiV2Printer.printString === "function");

const normalizeText = (value) => String(value ?? "").trim();

const buildPrintJobText = (format, article) => {
  const lines = [];
  const title = normalizeText(article?.descripcion || article?.name || "Articulo");
  const code = normalizeText(article?.codigoInterno || article?.code || "");
  const barcode = normalizeText(article?.codigoBarra || article?.codigoBarras || "");
  const price = Number(article?.precio ?? article?.price1 ?? 0).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const stock = article?.stock ?? article?.Stock ?? null;
  const updatedAt = normalizeText(article?.fechaActualizacion || article?.FechaActualizacion || "");

  if (format?.showCompanyName) {
    lines.push("AlfaScan");
  }

  if (format?.showDescription !== false) {
    lines.push(title);
  }

  if (format?.showInternalCode && code) {
    lines.push(`Cod. interno: ${code}`);
  }

  if (format?.showBarcode && barcode) {
    lines.push(`Cod. barra: ${barcode}`);
  }

  if (format?.showPrice !== false) {
    lines.push(`Precio: ${price}`);
  }

  if (format?.showStock && stock !== null && stock !== undefined && String(stock).trim() !== "") {
    lines.push(`Stock: ${stock}`);
  }

  if (format?.showDate && updatedAt) {
    lines.push(`Actualizado: ${updatedAt}`);
  }

  return `${lines.filter(Boolean).join("\n")}\n\n`;
};

export const printArticle = async ({ article, formatKey = "product" } = {}) => {
  if (!article) {
    throw new Error("Busque un artículo antes de imprimir.");
  }

  if (!isPrinterAvailable()) {
    throw new Error("Impresora Sunmi no disponible en este dispositivo.");
  }

  const formats = await loadPrintFormats();
  const format = formats.find((item) => item.key === formatKey) || formats[1] || formats[0];
  const text = buildPrintJobText(format, article);
  const alignment = ALIGNMENT_MAP[String(format?.alignment ?? "center").toLowerCase()] ?? 1;

  if (typeof SunmiV2Printer.printerInit === "function") {
    await SunmiV2Printer.printerInit();
  }

  if (typeof SunmiV2Printer.setAlignment === "function") {
    await SunmiV2Printer.setAlignment(alignment);
  }

  await SunmiV2Printer.printString(text);

  if (typeof SunmiV2Printer.lineWrap === "function") {
    await SunmiV2Printer.lineWrap(2);
  }

  return {
    format,
    text,
  };
};

