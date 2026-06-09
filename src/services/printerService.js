import { NativeModules } from "react-native";

import { getCompanyNameFromSqlConfig } from "@services/catalogService";
import {
  getDefaultPrintFormat,
  getPrinterStatus,
  initPrinter,
  loadPrintFormats,
  printLabel,
  printSimpleProductLabel,
} from "@services/sunmiPrinterService";

const FRIENDLY_PRINT_ERROR_MESSAGE = "No se pudo imprimir. Revisá la impresora y volvé a intentar.";

const delay = (ms = 0) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

const normalizeFormatKey = (value) => {
  if (value && typeof value === "object") {
    return String(value.key ?? value.formatKey ?? "product").trim().toLowerCase();
  }
  return String(value ?? "product").trim().toLowerCase();
};

const normalizeText = (value) => String(value ?? "").trim();

const resolveCompanyName = async ({ article, companyName } = {}) => {
  const manualCompanyName = String(companyName ?? "").trim();
  if (manualCompanyName) {
    return manualCompanyName;
  }

  const articleCompanyName = String(article?.companyName ?? "").trim();
  if (articleCompanyName) {
    return articleCompanyName;
  }

  return String(await getCompanyNameFromSqlConfig().catch(() => "")).trim();
};

export const printArticle = async ({
  article,
  formatKey = "product",
  format = null,
  companyName = "",
} = {}) => {
  if (!article) {
    throw new Error("Buscá un artículo antes de imprimir.");
  }

  const normalizedKey = normalizeFormatKey(formatKey);
  const status = await initPrinter();
  const printerAvailable = Boolean(status?.available ?? getPrinterStatus().available);

  console.log("[PRINT] printer available", printerAvailable);

  if (!printerAvailable) {
    throw new Error(status?.message || FRIENDLY_PRINT_ERROR_MESSAGE);
  }

  const diagnosticsModule = NativeModules?.SunmiDiagnostics;
  const resolvedCompanyName = await resolveCompanyName({ article, companyName });

  if (diagnosticsModule && typeof diagnosticsModule.printSimpleProductLabel === "function") {
    return await printSimpleProductLabel({
      formatKey: normalizedKey,
      article,
      format,
      companyName: resolvedCompanyName,
      copies: 1,
    });
  }

  console.log("[PRINT] SunmiDiagnostics not available, trying fallback");
  const resolvedFormat =
    format && typeof format === "object"
      ? format
      : (await loadPrintFormats().catch(() => null))?.[normalizedKey] || getDefaultPrintFormat(normalizedKey);
  const fallbackResult = await printLabel(
    resolvedFormat,
    {
      ...article,
      companyName: resolvedCompanyName,
    },
    {
      companyName: resolvedCompanyName,
    },
  );

  console.log("[PRINT] success");
  return { printed: true, formatKey: normalizedKey, layout: fallbackResult?.layout || null };
};

export const printLabelsBatch = async (items = [], formatKey = "product", options = {}) => {
  const labels = Array.isArray(items) ? items : [];
  const summary = {
    total: labels.length,
    printed: 0,
    failed: 0,
    errors: [],
  };

  if (labels.length === 0) {
    return summary;
  }

  const sharedCompanyName = await resolveCompanyName({
    companyName: options.companyName,
    article: labels[0]?.article ?? labels[0],
  });

  for (let index = 0; index < labels.length; index += 1) {
    const item = labels[index] || {};
    const article = item.article ?? item;
    const itemFormatKey = String(item.formatKey ?? formatKey ?? "product").trim().toLowerCase();

    try {
      await printArticle({
        article,
        formatKey: itemFormatKey,
        format: item.format ?? null,
        companyName: sharedCompanyName,
      });
      summary.printed += 1;
    } catch (error) {
      summary.failed += 1;
      const message = String(error?.message || error || "").trim();
      summary.errors.push({
        index,
        code: normalizeText(
          article?.codigoArticulo ||
            article?.CodigoArticulo ||
            article?.codigoInterno ||
            article?.CodigoInterno ||
            article?.codigoBarra ||
            article?.CodigoBarra ||
            article?.codigoBarras ||
            article?.CodigoBarras ||
            article?.codigo ||
            article?.Codigo ||
            article?.code,
        ),
        message,
      });
      console.log("[PRINT] batch error", { index, message });
      if (!options.continueOnError) {
        break;
      }
    }

    if (index < labels.length - 1) {
      await delay(options.pauseMs ?? 250);
    }
  }

  return summary;
};
