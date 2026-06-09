import { NativeModules, Platform } from "react-native";
import Constants from "expo-constants";

import { renderPrintLayout } from "@services/printLayoutService";

const LabelPrinterModule = NativeModules?.SunmiV2Printer || null;
const DiagnosticsModule = NativeModules?.SunmiDiagnostics || null;

const INTEGRATION_NOT_IMPLEMENTED_MESSAGE = "Integración nativa Sunmi no implementada";

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

const callNativeAsync = async (module, methodName, ...args) => {
  if (!module || typeof module[methodName] !== "function") {
    throw new Error(INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }

  return module[methodName](...args);
};

const getDiagnosticsModule = () => NativeModules?.SunmiDiagnostics || null;
const getLabelModule = () => NativeModules?.SunmiV2Printer || null;

const buildDeviceInfo = () => {
  const constants = Platform?.constants || {};
  return {
    manufacturer: String(constants.Manufacturer || constants.manufacturer || "").trim(),
    brand: String(constants.Brand || constants.brand || "").trim(),
    model: String(constants.Model || constants.model || "").trim(),
    device: String(constants.Device || constants.device || "").trim(),
    product: String(constants.Product || constants.product || "").trim(),
    androidVersion: String(constants.Release || constants.release || "").trim(),
    packageName: String(Constants?.expoConfig?.android?.package || Constants?.manifest2?.android?.package || Constants?.manifest?.android?.package || "").trim(),
  };
};

const detectSunmiFromDeviceInfo = () => {
  const info = buildDeviceInfo();
  const joined = [info.manufacturer, info.brand, info.model, info.device, info.product]
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
  const innerPrinterAvailable = await callNativeAsync(diagnostics, "isInnerPrinterAvailable");
  const bindStatus = await callNativeAsync(diagnostics, "bindPrinterService").catch((error) => ({
    bound: false,
    binding: false,
    lastError: error?.message || String(error || ""),
  }));
  const printerStatus = await callNativeAsync(diagnostics, "getPrinterStatus").catch((error) => ({
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
    if (!getDiagnosticsModule()) {
      return setStatus({
        ...DEFAULT_STATUS,
        hasModule: Boolean(getLabelModule()),
        isSunmiDevice: isSunmiDevice(),
        available: false,
        mode: "UNAVAILABLE",
        message: INTEGRATION_NOT_IMPLEMENTED_MESSAGE,
        initializedAt: new Date().toISOString(),
      });
    }

    try {
      const diagnostics = await readNativeDiagnostics();
      const nativeStatus = diagnostics.printerStatus || {};
      const available = Boolean(nativeStatus.bound || nativeStatus.printerReady);

      return setStatus({
        ...DEFAULT_STATUS,
        hasModule: true,
        isSunmiDevice: Boolean(diagnostics.isSunmi),
        available,
        mode: available ? "NATIVE" : "UNAVAILABLE",
        message:
          nativeStatus.lastError ||
          nativeStatus.message ||
          (available ? "Impresora detectada." : INTEGRATION_NOT_IMPLEMENTED_MESSAGE),
        printerVersion: String(nativeStatus.printerVersion ?? "").trim(),
        printerModal: String(nativeStatus.printerModal ?? "").trim(),
        printerSerialNo: String(nativeStatus.printerSerialNo ?? "").trim(),
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

export const printText = async (text, options = {}) => {
  const status = await ensureInitialized();
  const module = getLabelModule();
  if (!status.available) {
    throw new Error(status.message || INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }
  if (!module || typeof module.printString !== "function") {
    throw new Error(INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }

  const body = normalizeText(text);
  if (!body) {
    return { printed: false };
  }

  await setPrinterAlignment(options.align || "left");
  await setPrinterFontSize(options.fontSize || 16);
  await module.printString(`${body}\n`);
  return { printed: true, text: body };
};

export const printBarcode = async (code, options = {}) => {
  const status = await ensureInitialized();
  const module = getLabelModule();
  if (!status.available) {
    throw new Error(status.message || INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }
  if (!module || typeof module.printBarCode !== "function") {
    throw new Error(INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }

  const value = normalizeText(code);
  if (!value) {
    return { printed: false };
  }

  const symbology = BARCODE_SYMBOLOGY[String(options.barcodeType || "EAN13").toUpperCase()] ?? 2;
  const height = Math.max(80, Math.min(255, Number(options.height) || 120));
  const width = Math.max(2, Math.min(6, Number(options.width) || 2));
  const textposition = options.showNumber === false ? 0 : 2;
  await setPrinterAlignment("center");
  await module.printBarCode(value, symbology, height, width, textposition);
  return { printed: true, code: value };
};

export const printLabel = async (formatConfig = {}, product = {}, options = {}) => {
  const status = await ensureInitialized();
  const module = getLabelModule();
  if (!status.available) {
    throw new Error(status.message || INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }
  if (!module) {
    throw new Error(INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }

  const layout = renderPrintLayout(formatConfig, product, options);

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
    } else if (item.type === "logo") {
      await printText(item.value || "AlfaScan", { align: item.align, fontSize: item.fontSize });
    } else {
      await printText(item.value || item.sampleText || "", {
        align: item.align,
        fontSize: item.fontSize,
      });
    }

    lastBottom = targetTop + Number(item.height || 24);
  }

  if (typeof module.lineWrap === "function") {
    await module.lineWrap(2);
  }

  return { printed: true, layout };
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
      bindStatus: { attempted: false, success: false, error: INTEGRATION_NOT_IMPLEMENTED_MESSAGE },
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
    const [deviceInfo, innerPrinterAvailable, bindStatus, printerStatus] = await Promise.all([
      callNativeAsync(diagnostics, "getDeviceInfo"),
      callNativeAsync(diagnostics, "isInnerPrinterAvailable"),
      callNativeAsync(diagnostics, "bindPrinterService").catch((error) => ({
        bound: false,
        binding: false,
        lastError: error?.message || String(error || ""),
      })),
      callNativeAsync(diagnostics, "getPrinterStatus"),
    ]);

    const isSunmi = typeof diagnostics.isSunmiDevice === "function"
      ? Boolean(diagnostics.isSunmiDevice())
      : detectSunmiFromDeviceInfo();
    const available = Boolean(printerStatus?.bound || bindStatus?.bound);
    const errorMessage = printerStatus?.lastError || bindStatus?.lastError || printerStatus?.message || "";
    const paperPresent = Boolean(printerStatus?.paperPresent ?? (available && !/papel/i.test(errorMessage)));

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
        message: errorMessage || (available ? "Impresora detectada." : INTEGRATION_NOT_IMPLEMENTED_MESSAGE),
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
      bindStatus: { attempted: true, success: false, error: error?.message || String(error || "") },
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
  const diagnostics = getDiagnosticsModule();
  if (!diagnostics) {
    throw new Error(INTEGRATION_NOT_IMPLEMENTED_MESSAGE);
  }

  return callNativeAsync(diagnostics, "printTestPage");
};

export default {
  isSunmiDevice,
  isPrinterAvailable,
  initPrinter,
  printText,
  printBarcode,
  printLabel,
  getPrinterStatus,
  getSunmiDiagnostics,
  printSunmiDiagnosticTest,
};
