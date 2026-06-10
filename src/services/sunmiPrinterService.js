import { NativeModules, Platform } from "react-native";
import Constants from "expo-constants";

import {
  buildPrintableLayout,
  getDefaultPrintFormat,
  loadPrintFormats,
  mapEditorFontSizeToSunmi,
} from "@services/printLayoutService";
import { isMonospacePrintFont } from "@services/printFontService";
import {
  getCatalogConfig,
  getCompanyNameFromSqlConfig,
} from "@services/catalogService";

const INTEGRATION_NOT_IMPLEMENTED_MESSAGE =
  "Integración Sunmi no disponible en esta build.";
const EMPTY_LAYOUT_MESSAGE = "Este formato no tiene elementos visibles.";

const ALIGNMENT_MAP = {
  left: 0,
  center: 1,
  right: 2,
};

const BARCODE_SYMBOLOGY = {
  AUTO: 2,
  EAN13: 2,
  EAN8: 3,
  CODE39: 4,
  CODE128: 8,
};

const DEFAULT_STATUS = {
  hasModule: false,
  isSunmiDevice: false,
  available: false,
  mode: "UNAVAILABLE",
  message: INTEGRATION_NOT_IMPLEMENTED_MESSAGE,
  printerVersion: "",
  printerModal: "",
  printerSerialNo: "",
  initializedAt: null,
};

let printerStatus = { ...DEFAULT_STATUS };
let initPromise = null;

const cloneStatus = () => ({ ...printerStatus });

const setStatus = (nextStatus = {}) => {
  printerStatus = {
    ...DEFAULT_STATUS,
    ...nextStatus,
  };
  return cloneStatus();
};

const normalizeText = (value) => String(value ?? "").trim();

const parsePriceValue = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const raw = String(value ?? "").trim();
  if (!raw) {
    return 0;
  }

  const cleaned = raw.replace(/[^\d,.-]/g, "");
  if (!cleaned) {
    return 0;
  }

  const normalized =
    cleaned.includes(",") && cleaned.includes(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(",", ".");

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
};

const firstNonEmptyText = (...values) => {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) {
      return text;
    }
  }
  return "";
};

const callNativeAsync = async (module, methodName, ...args) => {
  if (!module || typeof module[methodName] !== "function") {
    throw new Error(INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }

  return module[methodName](...args);
};

const getDiagnosticsModule = () => NativeModules?.SunmiDiagnostics || null;
const getLabelModule = () =>
  NativeModules?.SunmiPrinterModule || NativeModules?.SunmiV2Printer || null;
const buildDeviceInfo = () => {
  const constants = Platform?.constants || {};
  return {
    manufacturer: String(
      constants.Manufacturer || constants.manufacturer || "",
    ).trim(),
    brand: String(constants.Brand || constants.brand || "").trim(),
    model: String(constants.Model || constants.model || "").trim(),
    device: String(constants.Device || constants.device || "").trim(),
    product: String(constants.Product || constants.product || "").trim(),
    androidVersion: String(constants.Release || constants.release || "").trim(),
    packageName: String(
      Constants?.expoConfig?.android?.package ||
        Constants?.manifest2?.android?.package ||
        Constants?.manifest?.android?.package ||
        "",
    ).trim(),
  };
};

const detectSunmiFromDeviceInfo = () => {
  const info = buildDeviceInfo();
  const joined = [
    info.manufacturer,
    info.brand,
    info.model,
    info.device,
    info.product,
  ]
    .join(" ")
    .toLowerCase();
  return joined.includes("sunmi");
};

export const isSunmiDevice = () => {
  const diagnostics = getDiagnosticsModule();
  if (diagnostics && typeof diagnostics.isSunmiDevice === "function") {
    try {
      return Boolean(diagnostics.isSunmiDevice());
    } catch (error) {
      return detectSunmiFromDeviceInfo();
    }
  }

  return detectSunmiFromDeviceInfo();
};

export const getPrinterStatus = () => cloneStatus();

export const isPrinterAvailable = () => Boolean(printerStatus.available);

const readNativeDiagnostics = async () => {
  const diagnostics = getDiagnosticsModule();
  if (!diagnostics) {
    throw new Error(INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }

  const deviceInfo = await callNativeAsync(diagnostics, "getDeviceInfo");
  const isSunmi =
    typeof diagnostics.isSunmiDevice === "function"
      ? Boolean(diagnostics.isSunmiDevice())
      : detectSunmiFromDeviceInfo();
  const innerPrinterAvailable = await callNativeAsync(
    diagnostics,
    "isInnerPrinterAvailable",
  );
  const bindStatus = await callNativeAsync(
    diagnostics,
    "bindPrinterService",
  ).catch((error) => ({
    bound: false,
    binding: false,
    lastError: error?.message || String(error || ""),
  }));
  const printerStatus = await callNativeAsync(
    diagnostics,
    "getPrinterStatus",
  ).catch((error) => ({
    available: false,
    mode: "UNAVAILABLE",
    message: error?.message || String(error || ""),
    printerVersion: "",
    printerModal: "",
    printerSerialNo: "",
    paperPresent: false,
    lastError: error?.message || String(error || ""),
  }));

  return {
    deviceInfo: deviceInfo || buildDeviceInfo(),
    isSunmi,
    innerPrinterAvailable: Boolean(innerPrinterAvailable),
    bindStatus: bindStatus || {},
    printerStatus: printerStatus || {},
  };
};

export const initPrinter = async () => {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const diagnostics = getDiagnosticsModule();
      if (diagnostics) {
        try {
          const diagnosticStatus = await getSunmiDiagnostics();
          const printerStatus = diagnosticStatus?.printerStatus || {};
          const available = Boolean(
            printerStatus?.available ||
            diagnosticStatus?.bindStatus?.success ||
            diagnosticStatus?.innerPrinterAvailable,
          );

          return setStatus({
            ...DEFAULT_STATUS,
            hasModule: true,
            isSunmiDevice: Boolean(
              diagnosticStatus?.isSunmiDevice ?? isSunmiDevice(),
            ),
            available,
            mode: available ? "NATIVE" : "UNAVAILABLE",
            message:
              printerStatus?.message ||
              diagnosticStatus?.error ||
              (available
                ? "Impresora detectada."
                : INTEGRATION_NOT_IMPLEMENTED_MESSAGE),
            printerVersion: String(printerStatus?.printerVersion ?? "").trim(),
            printerModal: String(printerStatus?.printerModal ?? "").trim(),
            printerSerialNo: String(
              printerStatus?.printerSerialNo ?? "",
            ).trim(),
            initializedAt: new Date().toISOString(),
          });
          return cloneStatus();
        } catch (diagnosticError) {
          if (__DEV__) {
            console.log(
              "[SUNMI] diagnostics init fallback",
              diagnosticError?.message || diagnosticError,
            );
          }
        }
      }

      const module = getLabelModule();
      if (!module) {
        return setStatus({
          ...DEFAULT_STATUS,
          hasModule: false,
          isSunmiDevice: isSunmiDevice(),
          available: false,
          mode: "UNAVAILABLE",
          message: INTEGRATION_NOT_IMPLEMENTED_MESSAGE,
          initializedAt: new Date().toISOString(),
        });
      }

      if (typeof module.initPrinter === "function") {
        await module.initPrinter();
      } else if (typeof module.printerInit === "function") {
        await module.printerInit();
      }

      const printerInfo = await getPrinterInfo().catch(() => ({}));
      const available = Boolean(
        printerInfo?.hasPrinter ?? printerInfo?.available,
      );

      return setStatus({
        ...DEFAULT_STATUS,
        hasModule: true,
        isSunmiDevice: isSunmiDevice(),
        available,
        mode: available ? "NATIVE" : "UNAVAILABLE",
        message:
          printerInfo?.message ||
          (available
            ? "Impresora detectada."
            : INTEGRATION_NOT_IMPLEMENTED_MESSAGE),
        printerVersion: String(printerInfo?.printerVersion ?? "").trim(),
        printerModal: String(printerInfo?.printerModal ?? "").trim(),
        printerSerialNo: String(printerInfo?.printerSerialNo ?? "").trim(),
        initializedAt: new Date().toISOString(),
      });
    } catch (error) {
      return setStatus({
        ...DEFAULT_STATUS,
        hasModule: true,
        isSunmiDevice: isSunmiDevice(),
        available: false,
        mode: "UNAVAILABLE",
        message: error?.message || INTEGRATION_NOT_IMPLEMENTED_MESSAGE,
        initializedAt: new Date().toISOString(),
      });
    }
  })();

  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
};

export const getPrinterInfo = async () => {
  const module = getLabelModule();
  if (!module) {
    throw new Error(INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }

  if (typeof module.getPrinterInfo === "function") {
    return module.getPrinterInfo();
  }

  const [printerVersion, printerModal, printerSerialNo, hasPrinter] =
    await Promise.all([
      typeof module.getPrinterVersion === "function"
        ? module.getPrinterVersion()
        : "",
      typeof module.getPrinterModal === "function"
        ? module.getPrinterModal()
        : "",
      typeof module.getPrinterSerialNo === "function"
        ? module.getPrinterSerialNo()
        : "",
      typeof module.hasPrinter === "function" ? module.hasPrinter() : false,
    ]);

  return {
    hasPrinter: Boolean(hasPrinter),
    available: Boolean(hasPrinter),
    printerVersion: String(printerVersion ?? "").trim(),
    printerModal: String(printerModal ?? "").trim(),
    printerSerialNo: String(printerSerialNo ?? "").trim(),
  };
};

const ensureInitialized = async () => {
  if (!printerStatus.initializedAt && !initPromise) {
    await initPrinter();
  }
  return cloneStatus();
};

const setPrinterAlignment = async (alignment = "center") => {
  const module = getLabelModule();
  if (!module || typeof module.setAlignment !== "function") {
    throw new Error(INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }

  await module.setAlignment(ALIGNMENT_MAP[alignment] ?? 1);
};

const setPrinterFontSize = async (size = 16) => {
  const module = getLabelModule();
  if (!module || typeof module.setFontSize !== "function") {
    throw new Error(INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }

  await module.setFontSize(Math.max(10, Number(size) || 16));
};

const buildSeparatorText = (item = {}) => {
  const width = Math.max(
    12,
    Math.min(48, Math.round(Number(item.width || 0) / 8) || 24),
  );
  return "-".repeat(width);
};

export const printText = async (text, options = {}) => {
  const status = await ensureInitialized();
  const module = getLabelModule();
  if (!status.available) {
    throw new Error(status.message || INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }
  if (
    !module ||
    (typeof module.printText !== "function" &&
      typeof module.printString !== "function")
  ) {
    throw new Error(INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }

  const body = normalizeText(text);
  if (!body) {
    return { printed: false };
  }

  await setPrinterAlignment(options.align || "left");
  const wantsMonospace = isMonospacePrintFont(options.fontFamily);
  if (
    typeof module.printTextWithFont === "function" &&
    (options.italic || wantsMonospace)
  ) {
    const nativeFont = wantsMonospace ? "monospace" : "serif";
    await module.printTextWithFont(
      `${body}\n`,
      nativeFont,
      Math.max(10, Number(options.fontSize) || 16),
    );
  } else {
    await setPrinterFontSize(options.fontSize || 16);
    if (typeof module.printText === "function") {
      await module.printText(`${body}\n`);
    } else {
      await module.printString(`${body}\n`);
    }
  }
  return { printed: true, text: body };
};

export const printBarcode = async (code, options = {}) => {
  const status = await ensureInitialized();
  const module = getLabelModule();
  if (!status.available) {
    throw new Error(status.message || INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }
  if (
    !module ||
    (typeof module.printBarcode !== "function" &&
      typeof module.printBarCode !== "function")
  ) {
    throw new Error(INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }

  const value = normalizeText(code);
  if (!value) {
    return { printed: false };
  }

  const symbology =
    BARCODE_SYMBOLOGY[String(options.barcodeType || "EAN13").toUpperCase()] ??
    2;
  const height = Math.max(80, Math.min(255, Number(options.height) || 120));
  const width = Math.max(2, Math.min(6, Number(options.width) || 2));
  const textposition = options.showNumber === false ? 0 : 2;
  await setPrinterAlignment("center");
  if (typeof module.printBarcode === "function") {
    await module.printBarcode(value);
  } else {
    await module.printBarCode(value, symbology, height, width, textposition);
  }
  return { printed: true, code: value };
};

export const printQrCode = async (text, options = {}) => {
  const status = await ensureInitialized();
  const module = getLabelModule();
  if (!status.available) {
    throw new Error(status.message || INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }
  if (
    !module ||
    (typeof module.printQrCode !== "function" &&
      typeof module.printQRCode !== "function")
  ) {
    throw new Error(INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }

  const value = normalizeText(text);
  if (!value) {
    return { printed: false };
  }

  if (typeof module.printQrCode === "function") {
    await module.printQrCode(value);
  } else {
    const modulesize = Math.max(
      1,
      Math.min(16, Number(options.modulesize) || 4),
    );
    const errorlevel = Math.max(
      0,
      Math.min(3, Number(options.errorlevel) || 2),
    );
    await module.printQRCode(value, modulesize, errorlevel);
  }
  return { printed: true, text: value };
};

export const printLabel = async (
  formatConfig = {},
  product = {},
  options = {},
) => {
  const status = await ensureInitialized();
  const module = getLabelModule();
  if (__DEV__) {
    console.log("[PRINT] format", formatConfig);
    console.log("[PRINT] printer available", status.available);
    console.log("[PRINT] printing", product);
  }
  if (!status.available) {
    throw new Error(status.message || INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }
  if (!module) {
    throw new Error(INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }

  const layout = buildPrintableLayout(formatConfig, product, options);
  if (!Array.isArray(layout.items) || layout.items.length === 0) {
    throw new Error(EMPTY_LAYOUT_MESSAGE);
  }

  if (__DEV__) {
    console.log(
      "[PRINT_LAYOUT] paperWidthMm",
      layout.paperWidthMm || formatConfig?.paperWidth || 80,
    );
  }

  // Current native flow:
  // Layout -> ordered text commands -> printText()/printBarcode().
  // Exact X/Y placement is not possible with printText().
  // Future exact rendering should be:
  // Layout -> Bitmap -> Sunmi printBitmap().
  if (typeof module.printerInit === "function") {
    await module.printerInit();
  }

  let lastBottom = 0;
  for (const item of layout.items) {
    const targetTop = Number(item.y || 0);
    const gap = Math.max(0, Math.round((targetTop - lastBottom) / 18));
    if (gap > 0 && typeof module.lineWrap === "function") {
      await module.lineWrap(gap);
    }

    if (item.type === "barcode") {
      await printBarcode(item.value, {
        barcodeType: item.barcodeType,
        height: item.height,
        width: item.width,
        showNumber: item.showNumber,
      });
    } else if (item.type === "separator") {
      await printText(buildSeparatorText(item), {
        align: "center",
        fontSize: Math.max(10, Number(item.fontSize || 16)),
      });
    } else if (item.type === "logo") {
      const sunmiFontSize = Math.max(
        18,
        Number(
          item.sunmiFontSize ??
            mapEditorFontSizeToSunmi(
              item.editorFontSize ?? item.fontSize,
              item.key,
              layout.paperWidthMm,
            ),
        ),
      );
      await printText(item.value || item.sampleText || "", {
        align: item.align,
        fontSize: sunmiFontSize,
        italic: item.italic,
        fontFamily: item.fontFamily,
      });
    } else {
      const sunmiFontSize = Math.max(
        18,
        Number(
          item.sunmiFontSize ??
            mapEditorFontSizeToSunmi(
              item.editorFontSize ?? item.fontSize,
              item.key,
              layout.paperWidthMm,
            ),
        ),
      );
      await printText(item.value || item.sampleText || "", {
        align: item.align,
        fontSize: sunmiFontSize,
        italic: item.italic,
        fontFamily: item.fontFamily,
      });
    }

    lastBottom = targetTop + Number(item.height || 24);
  }

  if (typeof module.lineWrap === "function") {
    await module.lineWrap(2);
  }

  return { printed: true, layout };
};

const formatSimpleCurrency = (value) => {
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

export const printSimpleProductLabel = async (
  payloadOrFormatKey = "product",
  productArg = {},
) => {
  const isPayloadObject =
    payloadOrFormatKey &&
    typeof payloadOrFormatKey === "object" &&
    !Array.isArray(payloadOrFormatKey);

  const input = isPayloadObject
    ? payloadOrFormatKey
    : {
        formatKey: payloadOrFormatKey,
        ...productArg,
      };

  const key = String(input?.formatKey ?? "product")
    .trim()
    .toLowerCase();
  const diagnostics = await getSunmiDiagnostics().catch(() => null);
  const printerAvailable = Boolean(
    diagnostics?.printerStatus?.available ||
    diagnostics?.bindStatus?.success ||
    diagnostics?.innerPrinterAvailable,
  );

  if (!printerAvailable) {
    throw new Error(
      diagnostics?.error ||
        diagnostics?.printerStatus?.message ||
        "No se pudo conectar con la impresora.",
    );
  }

  const rawSource = input?.article ?? input?.product ?? input;
  const payload = {
    description: String(
      input?.description ??
        input?.descripcion ??
        rawSource?.description ??
        rawSource?.descripcion ??
        rawSource?.name ??
        "",
    ).trim(),
    price: parsePriceValue(
      input?.price ??
        input?.priceValue ??
        rawSource?.precio ??
        rawSource?.price1 ??
        rawSource?.price ??
        0,
    ),
    barcode: firstNonEmptyText(
      input?.barcode,
      rawSource?.barcode,
      rawSource?.codigoBarra,
      rawSource?.CodigoBarra,
      rawSource?.codigoBarras,
      rawSource?.CodigoBarras,
      rawSource?.codigo,
      rawSource?.Codigo,
      rawSource?.code,
    ),
    internalCode: firstNonEmptyText(
      input?.internalCode,
      rawSource?.internalCode,
      rawSource?.codigoArticulo,
      rawSource?.CodigoArticulo,
      rawSource?.codigoInterno,
      rawSource?.CodigoInterno,
      rawSource?.codigo,
      rawSource?.Codigo,
      rawSource?.code,
    ),
  };
  const companyName =
    String(input?.companyName ?? rawSource?.companyName ?? "").trim() ||
    (await getCompanyNameFromSqlConfig().catch(() => ""));
  const catalogConfig = await getCatalogConfig().catch(() => null);
  const isOnlineMode =
    String(catalogConfig?.mode ?? "")
      .trim()
      .toUpperCase() === "ONLINE";
  const formatConfig =
    input?.format && typeof input.format === "object"
      ? input.format
      : (await loadPrintFormats().catch(() => null))?.[key] ||
        (!isOnlineMode ? getDefaultPrintFormat(key) : null);
  if (!formatConfig) {
    throw new Error("No se pudo cargar el diseño de impresión desde SQL.");
  }
  const safeCode = payload.internalCode || payload.barcode || "-";

  console.log("[PRINT] using format", key);
  console.log("[PRINT] companyName", companyName || "");
  console.log("[PRINT] codes", {
    barcode: payload.barcode,
    internalCode: payload.internalCode,
  });
  console.log("[PRINT] payload", {
    formatKey: key,
    companyName: companyName || "",
    descripcionLength: payload.description.length,
    precioTexto: formatSimpleCurrency(payload.price),
    codigo: safeCode,
  });

  const printProduct = {
    descripcion: payload.description,
    name: payload.description,
    precio: payload.price,
    price: payload.price,
    price1: payload.price,
    codigoBarra: payload.barcode,
    CodigoBarra: payload.barcode,
    codigoBarras: payload.barcode,
    CodigoBarras: payload.barcode,
    barcode: payload.barcode,
    code: payload.internalCode || payload.barcode,
    codigo: payload.internalCode || payload.barcode,
    codigoArticulo: payload.internalCode,
    CodigoArticulo: payload.internalCode,
    codigoInterno: payload.internalCode,
    CodigoInterno: payload.internalCode,
    internalCode: payload.internalCode,
    companyName,
  };

  const layout = buildPrintableLayout(formatConfig, printProduct, {
    companyName,
    fallbackText: "",
  });
  if (!Array.isArray(layout.items) || layout.items.length === 0) {
    throw new Error(EMPTY_LAYOUT_MESSAGE);
  }

  if (__DEV__) {
    console.log(
      "[PRINT_LAYOUT] paperWidthMm",
      layout.paperWidthMm || formatConfig?.paperWidth || 80,
    );
    console.log("[PRINT_LAYOUT] items to native", layout.items.length);
    layout.items.forEach((item) => {
      if (!item) {
        return;
      }
      const campo = String(
        item.Campo ?? item.campo ?? item.valueKey ?? item.key ?? "Item",
      ).trim();
      console.log(
        "[PRINT_LAYOUT] native item",
        `Campo ${campo}`,
        `type ${String(item.type ?? "")}`,
        `visible ${Boolean(item.visible)}`,
      );
    });
  }

  const module = getDiagnosticsModule();
  console.log("[PRINT] using module", module ? "SunmiDiagnostics" : "none");
  if (!module || typeof module.printSimpleProductLabel !== "function") {
    throw new Error(
      "SunmiDiagnostics existe pero no expone printSimpleProductLabel. RecompilÃ¡ la app con npx expo run:android.",
    );
  }

  if (typeof module.bindPrinterService === "function") {
    await module.bindPrinterService().catch(() => {});
  } else if (typeof module.initPrinter === "function") {
    await module.initPrinter().catch(() => {});
  } else if (typeof module.printerInit === "function") {
    await module.printerInit().catch(() => {});
  }

  console.log("[PRINT] calling native Sunmi print");
  const itemsToNative = Array.isArray(layout?.items)
    ? layout.items.map((item) => {
        const barcodeValue = String(
          item?.barcode ??
            item?.value ??
            payload.barcode ??
            payload.internalCode ??
            "",
        ).trim();

        if (String(item?.type ?? "").trim() === "barcode") {
          return {
            ...item,
            type: "barcode",
            key: item?.key || "barcode",
            value: barcodeValue,
            barcode: barcodeValue,
            internalCode: payload.internalCode,
            code: payload.internalCode || payload.barcode,
          };
        }

        return {
          ...item,
          barcode: payload.barcode,
          internalCode: payload.internalCode,
          code: payload.internalCode || payload.barcode,
        };
      })
    : [];
  const result = await module.printSimpleProductLabel({
    formatKey: key,
    description: payload.description,
    price: formatSimpleCurrency(payload.price),
    barcode: payload.barcode,
    internalCode: payload.internalCode,
    companyName,
    copies: Math.max(1, Number(input?.copies ?? 1) || 1),
    items: itemsToNative,
  });
  console.log("[PRINT] success");

  return {
    printed: true,
    payload,
    formatKey: key,
    layout: result?.layout || null,
  };
};

export const printAlfaScanSmokeTest = async () => {
  const module = getDiagnosticsModule();
  if (!module || typeof module.printAlfaScanSmokeTest !== "function") {
    throw new Error(
      "SunmiDiagnostics existe pero no expone printAlfaScanSmokeTest. Recompilá la app con npx expo run:android.",
    );
  }

  console.log("[PRINT] calling printAlfaScanSmokeTest");
  const result = await module.printAlfaScanSmokeTest();
  console.log("[PRINT] smoke test success");
  return result;
};

export const getSunmiDiagnostics = async () => {
  const diagnostics = getDiagnosticsModule();
  if (!diagnostics) {
    return {
      implemented: false,
      device: buildDeviceInfo(),
      moduleAvailable: false,
      isSunmiDevice: detectSunmiFromDeviceInfo(),
      innerPrinterAvailable: false,
      bindStatus: {
        attempted: false,
        success: false,
        error: INTEGRATION_NOT_IMPLEMENTED_MESSAGE,
      },
      printerStatus: {
        available: false,
        mode: "UNAVAILABLE",
        message: INTEGRATION_NOT_IMPLEMENTED_MESSAGE,
        printerVersion: "",
        printerModal: "",
        printerSerialNo: "",
        paperPresent: false,
      },
      paperPresent: false,
      error: INTEGRATION_NOT_IMPLEMENTED_MESSAGE,
      baseStatus: getPrinterStatus(),
      constants: {},
    };
  }

  try {
    const [deviceInfo, innerPrinterAvailable, bindStatus, printerStatus] =
      await Promise.all([
        callNativeAsync(diagnostics, "getDeviceInfo"),
        callNativeAsync(diagnostics, "isInnerPrinterAvailable"),
        callNativeAsync(diagnostics, "bindPrinterService").catch((error) => ({
          bound: false,
          binding: false,
          lastError: error?.message || String(error || ""),
        })),
        callNativeAsync(diagnostics, "getPrinterStatus"),
      ]);

    const isSunmi =
      typeof diagnostics.isSunmiDevice === "function"
        ? Boolean(diagnostics.isSunmiDevice())
        : detectSunmiFromDeviceInfo();
    const available = Boolean(printerStatus?.bound || bindStatus?.bound);
    const errorMessage =
      printerStatus?.lastError ||
      bindStatus?.lastError ||
      printerStatus?.message ||
      "";
    const paperPresent = Boolean(
      printerStatus?.paperPresent ??
      (available && !/papel/i.test(errorMessage)),
    );

    return {
      implemented: true,
      device: deviceInfo || buildDeviceInfo(),
      moduleAvailable: true,
      isSunmiDevice: isSunmi,
      innerPrinterAvailable: Boolean(innerPrinterAvailable),
      bindStatus: {
        attempted: true,
        success: Boolean(bindStatus?.bound),
        error: errorMessage,
      },
      printerStatus: {
        available,
        mode: available ? "NATIVE" : "UNAVAILABLE",
        message:
          errorMessage ||
          (available
            ? "Impresora detectada."
            : INTEGRATION_NOT_IMPLEMENTED_MESSAGE),
        printerVersion: String(printerStatus?.printerVersion ?? "").trim(),
        printerModal: String(printerStatus?.printerModal ?? "").trim(),
        printerSerialNo: String(printerStatus?.printerSerialNo ?? "").trim(),
      },
      paperPresent,
      error: errorMessage,
      baseStatus: getPrinterStatus(),
      constants: {},
    };
  } catch (error) {
    return {
      implemented: true,
      device: buildDeviceInfo(),
      moduleAvailable: true,
      isSunmiDevice: false,
      innerPrinterAvailable: false,
      bindStatus: {
        attempted: true,
        success: false,
        error: error?.message || String(error || ""),
      },
      printerStatus: {
        available: false,
        mode: "UNAVAILABLE",
        message: error?.message || INTEGRATION_NOT_IMPLEMENTED_MESSAGE,
        printerVersion: "",
        printerModal: "",
        printerSerialNo: "",
        paperPresent: false,
      },
      paperPresent: false,
      error: error?.message || String(error || ""),
      baseStatus: getPrinterStatus(),
      constants: {},
    };
  }
};

export const printSunmiDiagnosticTest = async () => {
  const module = getLabelModule() || getDiagnosticsModule();
  if (!module) {
    throw new Error(INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }

  if (typeof module.printTestPage === "function") {
    return module.printTestPage();
  }

  const lines = [
    "AlfaScan",
    "Prueba de impresora",
    "",
    `Fecha/Hora: ${new Date().toLocaleString("es-AR")}`,
    "",
    "1234567890123",
  ];

  if (typeof module.printerInit === "function") {
    await module.printerInit();
  }
  if (
    typeof module.printString !== "function" ||
    typeof module.lineWrap !== "function"
  ) {
    throw new Error(INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }
  for (const line of lines) {
    await module.printString(`${line}\n`);
  }
  await module.lineWrap(2);
  return { printed: true };
};

export const printFontScaleTest = async () => {
  const module = getDiagnosticsModule();
  if (!module || typeof module.printFontScaleTest !== "function") {
    throw new Error(
      "SunmiDiagnostics existe pero no expone printFontScaleTest. RecompilÃ¡ la app con npx expo run:android.",
    );
  }

  console.log("[PRINT_LAYOUT] build db88bf8 active");
  console.log("[PRINT] calling printFontScaleTest");
  const result = await module.printFontScaleTest();
  console.log("[PRINT] font scale test success");
  return result;
};

export default {
  isSunmiDevice,
  isPrinterAvailable,
  initPrinter,
  printText,
  printBarcode,
  printLabel,
  printSimpleProductLabel,
  printAlfaScanSmokeTest,
  getPrinterStatus,
  getPrinterInfo,
  getSunmiDiagnostics,
  printSunmiDiagnosticTest,
  printFontScaleTest,
  printQrCode,
};
