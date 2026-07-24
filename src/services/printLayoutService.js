import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";

import Configuration from "@db/Configuration";
import { getCatalogConfig } from "@services/catalogService";
import {
  loadPrintFormatsFromSql,
  savePrintFormatsToSql,
  syncPrintFormatsFromSql,
} from "@services/printSqlService";
import { resolvePreviewFontFamily } from "@services/printFontService";

export const PRINT_FORMAT_KEYS = ["gondola", "product", "small", "custom"];

export const PRINT_PAPER_OPTIONS = [
  { label: "58 mm", value: "58" },
  { label: "80 mm", value: "80" },
  { label: "Personalizado", value: "custom" },
];

export const PRINT_ALIGNMENT_OPTIONS = [
  { label: "Izquierda", value: "left" },
  { label: "Centro", value: "center" },
  { label: "Derecha", value: "right" },
];

export const PRINTABLE_WIDTH_OPTIONS = [
  { label: "384 px", value: "384" },
  { label: "576 px", value: "576" },
  { label: "Personalizado", value: "custom" },
];

export const DEFAULT_PRINTABLE_WIDTH_PX = 384;
export const DEFAULT_PRINT_OFFSET_X_PX = 0;
export const DEFAULT_PRINT_OFFSET_Y_PX = 0;
export const DEFAULT_PRINT_SCALE_PERCENT = 100;
export const DEFAULT_PRINT_EXTRA_TOP_FEED_PX = 0;
export const DEFAULT_PRINT_EXTRA_BOTTOM_FEED_PX = 0;
const DEFAULT_ARTICLE_PRICE_DECIMALS = 2;
const PRINT_DEVICE_CONFIG_STORAGE_PREFIX = "@alfascan/print-device-config";

const BASE_DESIGN_WIDTH = 320;
const PRINT_DEVICE_CONFIG_KEYS = {
  printableWidthPx: "PRINTABLE_WIDTH_PX",
  offsetX: "PRINT_OFFSET_X_PX",
  offsetY: "PRINT_OFFSET_Y_PX",
  scalePercent: "PRINT_SCALE_PERCENT",
  testMode: "PRINT_TEST_MODE",
  autoCenter: "PRINT_AUTO_CENTER",
  removeSystemMargin: "PRINT_REMOVE_SYSTEM_MARGIN",
  extraTopFeedPx: "PRINT_EXTRA_TOP_FEED_PX",
  extraBottomFeedPx: "PRINT_EXTRA_BOTTOM_FEED_PX",
};

const clone = (value, fallback = null) => {
  if (value === undefined || value === null) {
    return fallback;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return fallback;
  }
};

let cachedArticlePriceDecimals = DEFAULT_ARTICLE_PRICE_DECIMALS;
let articlePriceDecimalsPromise = null;

const normalizeStorageKeyPart = (value = "") =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const toInt = (value, fallback = 0) => {
  const parsed = parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePrintableWidthPx = (
  value,
  fallback = DEFAULT_PRINTABLE_WIDTH_PX,
) => {
  const parsed = toInt(value, fallback);
  if (parsed === 384 || parsed === 576) {
    return parsed;
  }
  return Math.max(1, parsed || fallback);
};

const normalizePrintOffsetPx = (value, fallback = 0) =>
  Math.round(Number.isFinite(Number(value)) ? Number(value) : fallback);

const normalizePrintScalePercent = (
  value,
  fallback = DEFAULT_PRINT_SCALE_PERCENT,
) => {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(10, Math.min(400, parsed || fallback));
};

const normalizePrintModeFlag = (value, fallback = false) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return Boolean(fallback);
  }
  return Configuration.isTruthyConfigValue(value);
};

const normalizePrintFeedPx = (value, fallback = 0) => {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, parsed);
};

const normalizeArticlePriceDecimals = (value, fallback = DEFAULT_ARTICLE_PRICE_DECIMALS) => {
  const parsed = Math.round(Number(String(value ?? "").trim().replace(",", ".")));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 6) {
    return fallback;
  }
  return parsed;
};

const getFallbackDeviceSignature = () => {
  const constants = Platform?.constants || {};
  return [
    constants.Manufacturer || constants.manufacturer || "",
    constants.Brand || constants.brand || "",
    constants.Model || constants.model || "",
    constants.Device || constants.device || "",
    constants.Product || constants.product || "",
    Constants?.expoConfig?.android?.package ||
      Constants?.manifest2?.android?.package ||
      Constants?.manifest?.android?.package ||
      "",
  ]
    .map(normalizeStorageKeyPart)
    .filter(Boolean)
    .join("-");
};

const buildPrintDeviceStorageKey = (signature) =>
  `${PRINT_DEVICE_CONFIG_STORAGE_PREFIX}/${signature || "default"}`;

const normalizePrintDeviceSignature = (...parts) =>
  parts.map(normalizeStorageKeyPart).filter(Boolean).join("-");

const resolvePrintDeviceStorageKeys = async () => {
  const diagnostics = NativeModules?.SunmiDiagnostics || null;
  let deviceInfo = null;
  let printerInfo = null;

  if (diagnostics && typeof diagnostics.getDeviceInfo === "function") {
    deviceInfo = await diagnostics.getDeviceInfo().catch(() => null);
  }

  if (diagnostics && typeof diagnostics.getPrinterStatus === "function") {
    printerInfo = await diagnostics.getPrinterStatus().catch(() => null);
  }

  const stableSignature = normalizePrintDeviceSignature(
    deviceInfo?.manufacturer,
    deviceInfo?.brand,
    deviceInfo?.model,
    deviceInfo?.device,
    deviceInfo?.product,
    deviceInfo?.packageName,
    getFallbackDeviceSignature(),
  );
  const specificSignature = normalizePrintDeviceSignature(
    printerInfo?.printerSerialNo,
    deviceInfo?.serialNo,
  );

  const keys = [
    specificSignature ? buildPrintDeviceStorageKey(specificSignature) : null,
    stableSignature ? buildPrintDeviceStorageKey(stableSignature) : null,
    buildPrintDeviceStorageKey("default"),
  ].filter(Boolean);

  return [...new Set(keys)];
};

const readLegacyPrintDeviceConfig = async () => {
  await Configuration.createTable();
  const [
    printableWidthPx,
    offsetX,
    offsetY,
    scalePercent,
    testMode,
    autoCenter,
    removeSystemMargin,
    extraTopFeedPx,
    extraBottomFeedPx,
  ] = await Promise.all([
    Configuration.getConfigValue(PRINT_DEVICE_CONFIG_KEYS.printableWidthPx),
    Configuration.getConfigValue(PRINT_DEVICE_CONFIG_KEYS.offsetX),
    Configuration.getConfigValue(PRINT_DEVICE_CONFIG_KEYS.offsetY),
    Configuration.getConfigValue(PRINT_DEVICE_CONFIG_KEYS.scalePercent),
    Configuration.getConfigValue(PRINT_DEVICE_CONFIG_KEYS.testMode),
    Configuration.getConfigValue(PRINT_DEVICE_CONFIG_KEYS.autoCenter),
    Configuration.getConfigValue(PRINT_DEVICE_CONFIG_KEYS.removeSystemMargin),
    Configuration.getConfigValue(PRINT_DEVICE_CONFIG_KEYS.extraTopFeedPx),
    Configuration.getConfigValue(PRINT_DEVICE_CONFIG_KEYS.extraBottomFeedPx),
  ]);

  return normalizePrintDeviceConfig({
    printableWidthPx,
    offsetX,
    offsetY,
    scalePercent,
    testMode,
    autoCenter,
    removeSystemMargin,
    extraTopFeedPx,
    extraBottomFeedPx,
  });
};

const normalizeContractText = (value = "") =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[áäàâ]/g, "a")
    .replace(/[éëèê]/g, "e")
    .replace(/[íïìî]/g, "i")
    .replace(/[óöòô]/g, "o")
    .replace(/[úüùû]/g, "u")
    .replace(/[\s_-]+/g, "");

const normalizeSqlContractType = (value = "") => {
  const normalized = normalizeContractText(value);
  if (!normalized) return "texto";
  if (normalized === "dato" || normalized === "empresa") return "Dato";
  if (
    normalized === "texto" ||
    normalized === "text" ||
    normalized === "descripcion" ||
    normalized === "description"
  ) {
    return "texto";
  }
  if (
    normalized === "precio" ||
    normalized === "price" ||
    normalized === "valor"
  ) {
    return "precio";
  }
  if (
    normalized === "codigobarra" ||
    normalized === "codigobarras" ||
    normalized === "barcode" ||
    normalized === "barra" ||
    normalized === "barras"
  ) {
    return "codigobarra";
  }
  if (
    normalized === "codigoarticulo" ||
    normalized === "codigointerno" ||
    normalized === "internalcode" ||
    normalized === "code" ||
    normalized === "codigo"
  ) {
    return "codigoarticulo";
  }
  if (normalized === "stock") return "stock";
  if (normalized === "textofijo" || normalized === "fixedtext")
    return "textoFijo";
  if (
    normalized === "linea" ||
    normalized === "line" ||
    normalized === "separator" ||
    normalized === "separador"
  )
    return "linea";
  if (
    normalized === "rectangulo" ||
    normalized === "rectangle" ||
    normalized === "cuadro" ||
    normalized === "box"
  )
    return "rectangulo";
  if (normalized === "logo") return "logo";
  if (normalized === "fecha" || normalized === "date") return "texto";
  return "texto";
};

const normalizeSqlContractCampo = (tipoElemento = "", campo = "") => {
  const tipo = normalizeSqlContractType(tipoElemento);
  const normalizedCampo = normalizeContractText(campo);

  if (tipo === "Dato") return "Empresa";
  if (tipo === "texto") {
    if (normalizedCampo === "empresa" || normalizedCampo === "companyname")
      return "Empresa";
    if (normalizedCampo === "descripcion" || normalizedCampo === "description")
      return "Descripcion";
    if (normalizedCampo === "fecha" || normalizedCampo === "date")
      return "Fecha";
    if (normalizedCampo === "textofijo" || normalizedCampo === "fixedtext")
      return "TextoFijo";
    return campo ? String(campo).trim() : null;
  }
  if (tipo === "precio") return "Precio";
  if (tipo === "codigobarra") return "CodigoBarra";
  if (tipo === "codigoarticulo") return "CodigoArticulo";
  if (tipo === "stock") return "Stock";
  if (tipo === "linea") return "TextoFijo";
  if (tipo === "textoFijo") return "TextoFijo";
  if (tipo === "rectangulo" || tipo === "logo") return null;

  if (normalizedCampo === "empresa" || normalizedCampo === "companyname")
    return "Empresa";
  if (normalizedCampo === "descripcion" || normalizedCampo === "description")
    return "Descripcion";
  if (normalizedCampo === "precio" || normalizedCampo === "price")
    return "Precio";
  if (
    normalizedCampo === "codigobarra" ||
    normalizedCampo === "codigobarras" ||
    normalizedCampo === "barcode"
  ) {
    return "CodigoBarra";
  }
  if (
    normalizedCampo === "codigoarticulo" ||
    normalizedCampo === "codigointerno" ||
    normalizedCampo === "internalcode"
  ) {
    return "CodigoArticulo";
  }
  if (normalizedCampo === "stock") return "Stock";
  if (normalizedCampo === "fecha" || normalizedCampo === "date") return "Fecha";
  if (normalizedCampo === "textofijo" || normalizedCampo === "fixedtext")
    return "TextoFijo";
  return campo ? String(campo).trim() : "TextoFijo";
};

const normalizeSqlContractValueKey = (campo = "", tipoElemento = "") => {
  const normalizedCampo = normalizeContractText(campo);
  const tipo = normalizeSqlContractType(tipoElemento);

  if (
    tipo === "Dato" ||
    normalizedCampo === "empresa" ||
    normalizedCampo === "companyname"
  ) {
    return "companyName";
  }
  if (normalizedCampo === "descripcion" || normalizedCampo === "description") {
    return "description";
  }
  if (
    tipo === "precio" ||
    normalizedCampo === "precio" ||
    normalizedCampo === "price"
  ) {
    return "price";
  }
  if (
    tipo === "codigobarra" ||
    normalizedCampo === "codigobarra" ||
    normalizedCampo === "barcode"
  ) {
    return "barcode";
  }
  if (
    tipo === "codigoarticulo" ||
    normalizedCampo === "codigoarticulo" ||
    normalizedCampo === "internalcode"
  ) {
    return "internalCode";
  }
  if (tipo === "stock" || normalizedCampo === "stock") return "stock";
  if (normalizedCampo === "fecha" || normalizedCampo === "date") return "date";
  if (normalizedCampo === "textofijo" || normalizedCampo === "fixedtext")
    return "text";
  if (tipo === "linea") return "separator";
  if (tipo === "rectangulo") return "rectangulo";
  if (tipo === "logo") return "logo";
  return campo ? String(campo).trim() : "";
};

const isBarcodeFont = (value = "") => {
  const normalized = normalizeContractText(value);
  return (
    normalized === "barcode" ||
    normalized === "codigodebarra" ||
    normalized === "codigobarra"
  );
};

const isBlankText = (value) => String(value ?? "").trim() === "";

const isLegacyRectangleElement = (
  element = {},
  tipoElemento = "",
  campo = "",
  fixedText = "",
) => {
  const normalizedType = normalizeSqlContractType(tipoElemento);
  const normalizedCampo = normalizeContractText(campo);
  const width = Number(element.width ?? element.Ancho ?? 0);
  const height = Number(element.height ?? element.Alto ?? 0);

  return (
    normalizedType === "texto" &&
    normalizedCampo === "textofijo" &&
    isBlankText(fixedText) &&
    width >= 80 &&
    height >= 20
  );
};

const getElementTextSignature = (element = {}) => {
  const tipoElemento = normalizeSqlContractType(
    element.TipoElemento ?? element.tipoElemento ?? element.type ?? "",
  );
  const campo = normalizeSqlContractCampo(
    tipoElemento,
    element.Campo ?? element.campo ?? element.valueKey ?? element.key,
  );
  const fixedText = String(
    element.TextoFijo ?? element.textoFijo ?? element.sampleText ?? "",
  ).trim();

  return {
    tipoElemento,
    campo,
    fixedText,
    normalizedCampo: normalizeContractText(campo),
    normalizedText: normalizeContractText(fixedText),
  };
};

const getDuplicateTextElementReason = (element, index, allElements) => {
  if (!element || !element.visible) {
    return null;
  }

  const tipoElemento = String(
    element.TipoElemento ?? element.tipoElemento ?? element.type ?? "",
  )
    .trim()
    .toLowerCase();
  if (tipoElemento !== "texto" && tipoElemento !== "text") {
    return null;
  }

  const { fixedText, normalizedCampo, normalizedText } =
    getElementTextSignature(element);
  const isBlankFixedText = String(fixedText ?? "").trim() === "";
  const isDescriptionField =
    normalizedCampo === "descripcion" || normalizedCampo === "description";
  const isOldFixedDescription =
    normalizedCampo === "textofijo" &&
    (normalizedText === "descripcion" ||
      normalizedText === "description" ||
      normalizedText === "{descripcion}" ||
      normalizedText === "{description}");
  const hasNewDescription = allElements.some((candidate, candidateIndex) => {
    if (!candidate || candidateIndex === index || !candidate.visible) {
      return false;
    }

    const candidateType = String(
      candidate.TipoElemento ?? candidate.tipoElemento ?? candidate.type ?? "",
    )
      .trim()
      .toLowerCase();
    if (candidateType !== "texto" && candidateType !== "text") {
      return false;
    }

    const candidateSignature = getElementTextSignature(candidate);
    return (
      candidateSignature.normalizedCampo === "descripcion" ||
      candidateSignature.normalizedCampo === "description"
    );
  });

  if (isOldFixedDescription && hasNewDescription) {
    return "contrato viejo duplicado de descripcion";
  }

  if (normalizedCampo === "textofijo" && isBlankFixedText) {
    return "textoFijo vacio o null";
  }

  return null;
};

export const replacePlaceholders = (
  source = "",
  product = {},
  element = {},
  options = {},
) => {
  const template = String(source ?? "").trim();
  if (!template) return "";
  const explicitPriceSymbol = templateHasExplicitPriceSymbol(template);

  const companyName = String(
    product.companyName ?? product.empresa ?? "",
  ).trim();
  const description = String(
    product.descripcion ?? product.description ?? product.name ?? "",
  ).trim();
  const priceValue = product.precio ?? product.price1 ?? product.price ?? 0;
  const barcodeValue = String(
    product.codigoBarra ??
      product.CodigoBarra ??
      product.codigoBarras ??
      product.CodigoBarras ??
      product.barcode ??
      product.codigo ??
      product.Codigo ??
      product.code ??
      "",
  ).trim();
  const internalCodeValue = String(
    product.codigoArticulo ??
      product.CodigoArticulo ??
      product.codigoInterno ??
      product.CodigoInterno ??
      product.internalCode ??
      product.codigo ??
      product.Codigo ??
      product.code ??
      "",
  ).trim();
  const stockValue = String(product.stock ?? product.Stock ?? "").trim();
  const dateValue = formatDateValue(
    product.fechaActualizacion ??
      product.FechaActualizacion ??
      product.date ??
      "",
  );

  const replacements = {
    empresa: companyName,
    companyname: companyName,
    descripcion: description,
    description: description,
    precio: formatCurrencyValue(
      priceValue,
      {
        ...element,
        showSymbol: explicitPriceSymbol ? false : element.showSymbol,
      },
      options,
    ),
    price: formatCurrencyValue(
      priceValue,
      {
        ...element,
        showSymbol: explicitPriceSymbol ? false : element.showSymbol,
      },
      options,
    ),
    codigobarra: barcodeValue || internalCodeValue,
    codigobarras: barcodeValue || internalCodeValue,
    barcode: barcodeValue || internalCodeValue,
    barra: barcodeValue || internalCodeValue,
    barras: barcodeValue || internalCodeValue,
    codigoarticulo: internalCodeValue || barcodeValue,
    codigointerno: internalCodeValue || barcodeValue,
    internalcode: internalCodeValue || barcodeValue,
    stock: stockValue,
    fecha: dateValue,
    date: dateValue,
  };

  return template.replace(/\{([^}]+)\}/g, (match, token) => {
    const normalized = normalizeContractText(token);
    if (Object.prototype.hasOwnProperty.call(replacements, normalized)) {
      return String(replacements[normalized] ?? "");
    }
    return match;
  });
};

export const renderElementValue = (
  element = {},
  product = {},
  fallback = "",
  options = {},
) => {
  const tipoElemento = normalizeSqlContractType(
    element.TipoElemento ?? element.tipoElemento ?? element.type,
  );
  const campo = normalizeSqlContractCampo(
    tipoElemento,
    element.Campo ?? element.campo ?? element.valueKey ?? element.key,
  );
  const fixedText = String(
    element.TextoFijo ?? element.textoFijo ?? element.sampleText ?? "",
  ).trim();
  if (tipoElemento === "textoFijo") {
    if (fixedText && /\{[^}]+\}/.test(fixedText)) {
      const rendered = replacePlaceholders(fixedText, product, element, options);
      return String(rendered ?? "").trim();
    }
    return fixedText;
  }
  const baseValue =
    campo === "Empresa"
      ? (product.companyName ?? product.empresa ?? "")
      : campo === "Descripcion"
        ? (product.descripcion ?? product.description ?? product.name ?? "")
        : campo === "Precio"
          ? (product.precio ?? product.price1 ?? product.price ?? 0)
          : campo === "CodigoBarra"
            ? (product.codigoBarra ??
              product.CodigoBarra ??
              product.codigoBarras ??
              product.CodigoBarras ??
              product.barcode ??
              product.codigo ??
              product.code ??
              "")
            : campo === "CodigoArticulo"
              ? (product.codigoArticulo ??
                product.CodigoArticulo ??
                product.codigoInterno ??
                product.CodigoInterno ??
                product.internalCode ??
                product.codigo ??
                product.code ??
                "")
              : campo === "Stock"
                ? (product.stock ?? product.Stock ?? "")
                : campo === "Fecha"
                  ? (product.fechaActualizacion ??
                    product.FechaActualizacion ??
                    product.date ??
                    "")
                  : "";

  if (tipoElemento === "rectangulo") return "";
  if (tipoElemento === "logo") return String(fallback ?? "").trim();
  if (tipoElemento === "linea") return fixedText || "------------";

  const templateSource = fixedText;
  if (templateSource && /\{[^}]+\}/.test(templateSource)) {
    const rendered = replacePlaceholders(templateSource, product, element, options);
    return String(rendered ?? "").trim();
  }

  const raw = baseValue === undefined || baseValue === null ? "" : baseValue;
  if (campo === "Precio") {
    return formatCurrencyValue(raw, element, options);
  }
  if (campo === "Fecha") {
    return formatDateValue(raw);
  }
  return String(raw ?? fallback ?? "").trim();
};

const createElement = (element = {}) => ({
  key: "",
  type: "text",
  label: "",
  visible: true,
  x: 0,
  y: 0,
  width: 120,
  height: 36,
  fontSize: 16,
  fontWeight: "400",
  align: "left",
  color: "#111827",
  uppercase: false,
  italic: false,
  tipoFuente: "Default",
  fontFamily: "sans-serif",
  maxLines: 2,
  zIndex: 1,
  sampleText: "",
  valueKey: "",
  formatAsPrice: false,
  showSymbol: true,
  decimals: 2,
  thousandSeparator: true,
  barcodeType: "EAN13",
  showNumber: true,
  separatorThickness: 2,
  ...element,
});

const buildElements = (elements = []) =>
  elements.map((item) => createElement(item));

const buildFormat = (format = {}) => ({
  name: "",
  paperWidth: "80",
  customPaperWidth: "",
  customPaperHeight: "",
  paperHeight: "auto",
  copies: "1",
  marginLeft: "0",
  marginTop: "0",
  marginRight: "0",
  marginBottom: "0",
  alignment: "center",
  showDescription: true,
  showPrice: true,
  showBarcode: true,
  showStock: false,
  showDate: false,
  showCompanyName: false,
  showInternalCode: false,
  showLogo: false,
  boldPrice: true,
  previewBeforePrint: true,
  ...format,
});

const gondolaTemplate = buildFormat({
  key: "gondola",
  name: "Góndola",
  paperWidth: "80",
  paperHeight: "auto",
  showDescription: true,
  showPrice: true,
  showBarcode: false,
  showStock: false,
  showDate: true,
  showCompanyName: true,
  showInternalCode: true,
  showLogo: false,
  elements: buildElements([
    {
      key: "companyName",
      label: "Empresa",
      type: "text",
      visible: true,
      x: 10,
      y: 8,
      width: 300,
      height: 28,
      fontSize: 18,
      fontWeight: "700",
      align: "center",
      maxLines: 1,
      zIndex: 1,
      valueKey: "companyName",
    },
    {
      key: "description",
      label: "Descripción",
      type: "text",
      visible: true,
      x: 10,
      y: 42,
      width: 300,
      height: 64,
      fontSize: 24,
      fontWeight: "700",
      align: "center",
      maxLines: 2,
      zIndex: 2,
      valueKey: "description",
    },
    {
      key: "price",
      label: "Precio",
      type: "text",
      visible: true,
      x: 10,
      y: 112,
      width: 300,
      height: 74,
      fontSize: 38,
      fontWeight: "700",
      align: "center",
      maxLines: 1,
      zIndex: 3,
      valueKey: "price",
      formatAsPrice: true,
      showSymbol: true,
    },
    {
      key: "internalCode",
      label: "Código interno",
      type: "text",
      visible: true,
      x: 10,
      y: 194,
      width: 300,
      height: 28,
      fontSize: 18,
      fontWeight: "400",
      align: "center",
      maxLines: 1,
      zIndex: 4,
      valueKey: "internalCode",
      sampleText: "Cod: {CodigoArticulo}",
    },
    {
      key: "date",
      label: "Fecha",
      type: "text",
      visible: true,
      x: 10,
      y: 228,
      width: 300,
      height: 24,
      fontSize: 14,
      fontWeight: "400",
      align: "right",
      maxLines: 1,
      zIndex: 5,
      valueKey: "date",
    },
  ]),
});

const productTemplate = buildFormat({
  key: "product",
  name: "Producto",
  paperWidth: "80",
  paperHeight: "auto",
  showDescription: true,
  showPrice: true,
  showBarcode: true,
  showStock: false,
  showDate: false,
  showCompanyName: true,
  showInternalCode: true,
  showLogo: false,
  elements: buildElements([
    {
      key: "companyName",
      label: "Empresa",
      type: "text",
      visible: true,
      x: 10,
      y: 8,
      width: 300,
      height: 26,
      fontSize: 16,
      fontWeight: "700",
      align: "center",
      maxLines: 1,
      zIndex: 1,
      valueKey: "companyName",
    },
    {
      key: "description",
      label: "Descripción",
      type: "text",
      visible: true,
      x: 10,
      y: 40,
      width: 300,
      height: 58,
      fontSize: 20,
      fontWeight: "700",
      align: "center",
      maxLines: 2,
      zIndex: 2,
      valueKey: "description",
    },
    {
      key: "price",
      label: "Precio",
      type: "text",
      visible: true,
      x: 10,
      y: 104,
      width: 300,
      height: 64,
      fontSize: 32,
      fontWeight: "700",
      align: "center",
      maxLines: 1,
      zIndex: 3,
      valueKey: "price",
      formatAsPrice: true,
      showSymbol: true,
    },
    {
      key: "barcode",
      label: "Código de barra",
      type: "barcode",
      visible: true,
      x: 10,
      y: 176,
      width: 300,
      height: 26,
      fontSize: 16,
      fontWeight: "400",
      align: "center",
      maxLines: 1,
      zIndex: 4,
      valueKey: "barcode",
      barcodeType: "EAN13",
      showNumber: true,
      sampleText: "Barra: {CodigoBarra}",
    },
    {
      key: "internalCode",
      label: "Código interno",
      type: "text",
      visible: true,
      x: 10,
      y: 206,
      width: 300,
      height: 26,
      fontSize: 16,
      fontWeight: "400",
      align: "center",
      maxLines: 1,
      zIndex: 5,
      valueKey: "internalCode",
      sampleText: "Cod: {CodigoArticulo}",
    },
  ]),
});

const smallTemplate = buildFormat({
  key: "small",
  name: "Chico",
  paperWidth: "80",
  paperHeight: "auto",
  showDescription: true,
  showPrice: true,
  showBarcode: false,
  showStock: false,
  showDate: false,
  showCompanyName: false,
  showInternalCode: true,
  showLogo: false,
  elements: buildElements([
    {
      key: "description",
      label: "Descripción",
      type: "text",
      visible: true,
      x: 10,
      y: 10,
      width: 300,
      height: 44,
      fontSize: 16,
      fontWeight: "700",
      align: "center",
      maxLines: 2,
      zIndex: 1,
      valueKey: "description",
    },
    {
      key: "price",
      label: "Precio",
      type: "text",
      visible: true,
      x: 10,
      y: 58,
      width: 300,
      height: 54,
      fontSize: 30,
      fontWeight: "700",
      align: "center",
      maxLines: 1,
      zIndex: 2,
      valueKey: "price",
      formatAsPrice: true,
      showSymbol: true,
    },
    {
      key: "internalCode",
      label: "Código interno",
      type: "text",
      visible: true,
      x: 10,
      y: 118,
      width: 300,
      height: 24,
      fontSize: 14,
      fontWeight: "400",
      align: "center",
      maxLines: 1,
      zIndex: 3,
      valueKey: "internalCode",
      sampleText: "Cod: {CodigoArticulo}",
    },
  ]),
});

const customTemplate = buildFormat({
  key: "custom",
  name: "Personalizado",
  paperWidth: "80",
  paperHeight: "auto",
  showDescription: true,
  showPrice: true,
  showBarcode: true,
  showStock: true,
  showDate: true,
  showCompanyName: true,
  showInternalCode: true,
  showLogo: false,
  elements: buildElements([
    {
      key: "companyName",
      label: "Empresa",
      type: "text",
      visible: true,
      x: 10,
      y: 8,
      width: 300,
      height: 26,
      fontSize: 16,
      fontWeight: "700",
      align: "center",
      maxLines: 1,
      zIndex: 1,
      valueKey: "companyName",
    },
    {
      key: "description",
      label: "Descripción",
      type: "text",
      visible: true,
      x: 10,
      y: 40,
      width: 300,
      height: 58,
      fontSize: 20,
      fontWeight: "700",
      align: "center",
      maxLines: 2,
      zIndex: 2,
      valueKey: "description",
    },
    {
      key: "price",
      label: "Precio",
      type: "text",
      visible: true,
      x: 10,
      y: 104,
      width: 300,
      height: 64,
      fontSize: 32,
      fontWeight: "700",
      align: "center",
      maxLines: 1,
      zIndex: 3,
      valueKey: "price",
      formatAsPrice: true,
      showSymbol: true,
    },
    {
      key: "internalCode",
      label: "Código interno",
      type: "text",
      visible: true,
      x: 10,
      y: 174,
      width: 145,
      height: 26,
      fontSize: 15,
      fontWeight: "400",
      align: "left",
      maxLines: 1,
      zIndex: 4,
      valueKey: "internalCode",
      sampleText: "Cod: {CodigoArticulo}",
    },
    {
      key: "stock",
      label: "Stock",
      type: "text",
      visible: true,
      x: 165,
      y: 174,
      width: 145,
      height: 26,
      fontSize: 15,
      fontWeight: "400",
      align: "right",
      maxLines: 1,
      zIndex: 5,
      valueKey: "stock",
      sampleText: "Stock: {Stock}",
    },
    {
      key: "barcode",
      label: "Código de barra",
      type: "barcode",
      visible: true,
      x: 10,
      y: 204,
      width: 300,
      height: 26,
      fontSize: 15,
      fontWeight: "400",
      align: "center",
      maxLines: 1,
      zIndex: 6,
      valueKey: "barcode",
      barcodeType: "EAN13",
      showNumber: true,
      sampleText: "Barra: {CodigoBarra}",
    },
    {
      key: "date",
      label: "Fecha",
      type: "text",
      visible: true,
      x: 10,
      y: 234,
      width: 300,
      height: 22,
      fontSize: 13,
      fontWeight: "400",
      align: "right",
      maxLines: 1,
      zIndex: 7,
      valueKey: "date",
    },
  ]),
});

const DEFAULT_PRINT_FORMATS = [
  gondolaTemplate,
  productTemplate,
  smallTemplate,
  customTemplate,
];
const DEFAULT_PRINT_CONFIG = {
  gondola: gondolaTemplate,
  product: productTemplate,
  small: smallTemplate,
  custom: customTemplate,
};

const getPaperWidthPx = (format = {}) => {
  if (String(format.paperWidth) === "58") return 240;
  if (String(format.paperWidth) === "80") return 320;

  const custom = parseInt(String(format.customPaperWidth ?? "").trim(), 10);
  if (Number.isFinite(custom) && custom > 0) {
    return Math.max(1, Math.round(custom * 4));
  }

  return 320;
};

const getPaperWidthMm = (format = {}) => {
  if (String(format.paperWidth) === "58") return 58;
  if (String(format.paperWidth) === "80") return 80;

  const custom = parseInt(String(format.customPaperWidth ?? "").trim(), 10);
  if (Number.isFinite(custom) && custom > 0) {
    return custom;
  }

  return 80;
};

const getPaperHeightMm = (format = {}) => {
  const explicit = parseInt(String(format.customPaperHeight ?? "").trim(), 10);
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }

  return 0;
};

const getPaperHeightPx = (format = {}, paperWidthPx = 320) => {
  const explicit = parseInt(String(format.customPaperHeight ?? "").trim(), 10);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.max(1, Math.round(explicit * 4));
  }

  const maxElementBottom = (
    Array.isArray(format.elements)
      ? format.elements
      : DEFAULT_PRINT_FORMATS[0].elements
  ).reduce(
    (max, element) =>
      Math.max(max, Number(element.y ?? 0) + Number(element.height ?? 0)),
    0,
  );
  const baseHeight = Math.max(maxElementBottom + 24, 220);
  const scale = paperWidthPx / BASE_DESIGN_WIDTH;
  return Math.round(baseHeight * scale);
};

const normalizeBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return Configuration.isTruthyConfigValue(value);
};

export const mapEditorFontSizeToSunmi = (
  fontSize,
  field = "",
  paperWidthMm = 80,
) => {
  const normalizedField = String(field ?? "")
    .trim()
    .toLowerCase();
  const editorSize = Math.max(8, Number(fontSize) || 16);
  const widthFactor = Number(paperWidthMm) <= 58 ? 0.95 : 1;

  const baseSize =
    editorSize <= 12
      ? 18
      : editorSize <= 18
        ? 22
        : editorSize <= 24
          ? 28
          : editorSize <= 32
            ? 36
            : Math.round(editorSize * 1.1);

  if (normalizedField === "price") {
    const priceSize =
      editorSize <= 12
        ? 30
        : editorSize <= 18
          ? 32
          : editorSize <= 24
            ? 36
            : editorSize <= 32
              ? 40
              : Math.round(editorSize * 1.15);
    return Math.max(30, Math.round(priceSize * widthFactor));
  }

  if (normalizedField === "companyname") {
    return Math.max(18, Math.round(baseSize * widthFactor));
  }

  if (normalizedField === "barcodetext") {
    return Math.max(12, Math.round((editorSize <= 12 ? 14 : 16) * widthFactor));
  }

  if (normalizedField === "description") {
    return Math.max(22, Math.round(baseSize * widthFactor));
  }

  if (
    normalizedField === "internalcode" ||
    normalizedField === "barcode" ||
    normalizedField === "code" ||
    normalizedField === "codigo"
  ) {
    return Math.max(18, Math.round(baseSize * widthFactor));
  }

  return Math.max(18, Math.round(baseSize * widthFactor));
};

const normalizeElement = (element = {}, fallback = {}) => {
  const safeElement =
    element && typeof element === "object" && !Array.isArray(element)
      ? element
      : {};
  const safeFallback =
    fallback && typeof fallback === "object" && !Array.isArray(fallback)
      ? fallback
      : {};
  const base = createElement(safeFallback);
  const next = createElement({ ...base, ...safeElement });
  next.key = String(next.key ?? safeFallback.key ?? "").trim();
  next.label = String(next.label ?? safeFallback.label ?? next.key).trim();
  next.type = String(next.type ?? safeFallback.type ?? "text").trim();
  next.visible = normalizeBoolean(
    safeElement.visible,
    safeFallback.visible ?? true,
  );
  next.x = Number.isFinite(Number(safeElement.x))
    ? Number(safeElement.x)
    : Number(base.x ?? 0);
  next.y = Number.isFinite(Number(safeElement.y))
    ? Number(safeElement.y)
    : Number(base.y ?? 0);
  next.width = Number.isFinite(Number(safeElement.width))
    ? Number(safeElement.width)
    : Number(base.width ?? 120);
  next.height = Number.isFinite(Number(safeElement.height))
    ? Number(safeElement.height)
    : Number(base.height ?? 36);
  next.fontSize = Number.isFinite(Number(safeElement.fontSize))
    ? Number(safeElement.fontSize)
    : Number(base.fontSize ?? 16);
  next.fontWeight = String(
    safeElement.fontWeight ??
      safeFallback.fontWeight ??
      base.fontWeight ??
      "400",
  );
  next.align = String(
    safeElement.align ?? safeFallback.align ?? base.align ?? "left",
  );
  next.color = String(
    safeElement.color ?? safeFallback.color ?? base.color ?? "#111827",
  );
  next.uppercase = normalizeBoolean(
    safeElement.uppercase,
    safeFallback.uppercase ?? false,
  );
  next.italic = normalizeBoolean(
    safeElement.italic ?? safeElement.italica,
    safeFallback.italic ?? false,
  );
  next.tipoFuente = String(
    safeElement.tipoFuente ||
      safeElement.TipoFuente ||
      safeFallback.tipoFuente ||
      base.tipoFuente ||
      "Default",
  ).trim();
  next.tipoElemento = String(
    safeElement.tipoElemento ||
      safeElement.TipoElemento ||
      safeElement.type ||
      base.type,
  ).trim();
  const legacyRectangle = isLegacyRectangleElement(
    safeElement,
    next.tipoElemento,
    safeElement.Campo ??
      safeElement.campo ??
      safeElement.valueKey ??
      safeElement.key,
    safeElement.TextoFijo ??
      safeElement.textoFijo ??
      safeElement.sampleText ??
      "",
  );
  if (legacyRectangle) {
    next.tipoElemento = "rectangulo";
  }
  next.TipoElemento = next.tipoElemento;
  next.fontFamily = String(
    resolvePreviewFontFamily(
      safeElement.tipoFuente ||
        safeElement.TipoFuente ||
        safeElement.fontFamily ||
        safeFallback.fontFamily ||
        base.fontFamily ||
        "Default",
    ),
  ).trim();
  next.maxLines = Math.max(
    1,
    parseInt(String(safeElement.maxLines ?? safeFallback.maxLines ?? 1), 10) ||
      1,
  );
  next.zIndex = Number.isFinite(Number(safeElement.zIndex))
    ? Number(safeElement.zIndex)
    : Number(base.zIndex ?? 1);
  next.sampleText = String(
    safeElement.sampleText ?? safeFallback.sampleText ?? base.sampleText ?? "",
  ).trim();
  next.valueKey = String(
    safeElement.valueKey ?? safeFallback.valueKey ?? base.valueKey ?? "",
  ).trim();
  next.formatAsPrice = normalizeBoolean(
    safeElement.formatAsPrice,
    safeFallback.formatAsPrice ?? false,
  );
  next.showSymbol = normalizeBoolean(
    safeElement.showSymbol,
    safeFallback.showSymbol ?? true,
  );
  next.decimals = Math.max(
    0,
    parseInt(String(safeElement.decimals ?? safeFallback.decimals ?? 2), 10) ||
      0,
  );
  next.thousandSeparator = normalizeBoolean(
    safeElement.thousandSeparator,
    safeFallback.thousandSeparator ?? true,
  );
  next.barcodeType = String(
    safeElement.barcodeType ?? safeFallback.barcodeType ?? "EAN13",
  )
    .trim()
    .toUpperCase();
  next.showNumber = normalizeBoolean(
    safeElement.showNumber,
    safeFallback.showNumber ?? true,
  );
  next.separatorThickness = Math.max(
    1,
    parseInt(
      String(
        safeElement.separatorThickness ?? safeFallback.separatorThickness ?? 2,
      ),
      10,
    ) || 1,
  );
  if (legacyRectangle) {
    next.type = "rectangulo";
    next.key = next.key || "rectangulo";
    next.label = next.label || "Rectangulo";
    next.visible = true;
    next.Campo = null;
    next.campo = null;
    next.valueKey = "";
    next.sampleText = "";
    next.TextoFijo = null;
    next.formatAsPrice = false;
    next.showSymbol = false;
    next.maxLines = 1;
  }
  return next;
};

const normalizeSqlElement = (element = {}) => {
  const safeElement =
    element && typeof element === "object" && !Array.isArray(element)
      ? element
      : {};
  const tipoElemento = normalizeSqlContractType(
    safeElement.TipoElemento ??
      safeElement.tipoElemento ??
      safeElement.type ??
      "text",
  );
  const campo = normalizeSqlContractCampo(
    tipoElemento,
    safeElement.Campo ??
      safeElement.campo ??
      safeElement.valueKey ??
      safeElement.key,
  );
  const fixedText = String(
    safeElement.TextoFijo ??
      safeElement.textoFijo ??
      safeElement.sampleText ??
      "",
  ).trim();
  const legacyRectangle = isLegacyRectangleElement(
    safeElement,
    tipoElemento,
    campo,
    fixedText,
  );
  const resolvedTipoElemento = legacyRectangle ? "rectangulo" : tipoElemento;
  const valueKey = normalizeSqlContractValueKey(campo, resolvedTipoElemento);
  const isBarcodeGraphic =
    resolvedTipoElemento === "codigobarra" &&
    isBarcodeFont(
      safeElement.TipoFuente ??
        safeElement.tipoFuente ??
        safeElement.fontFamily,
    );
  const isVisible =
    safeElement.visible !== undefined
      ? safeElement.visible !== false
      : safeElement.Visible !== undefined
        ? Number(safeElement.Visible) !== 0
        : true;
  return {
    ...createElement({}),
    ...safeElement,
    key: String(
      safeElement.key ??
        safeElement.valueKey ??
        safeElement.campo ??
        safeElement.Campo ??
        "",
    ).trim(),
    valueKey: String(
      safeElement.valueKey ??
        safeElement.key ??
        safeElement.Campo ??
        safeElement.campo ??
        "",
    ).trim(),
    type:
      resolvedTipoElemento === "linea"
        ? "separator"
        : resolvedTipoElemento === "rectangulo"
          ? "rectangulo"
          : resolvedTipoElemento === "logo"
            ? "logo"
            : isBarcodeGraphic
              ? "barcode"
              : "text",
    visible: isVisible,
    x: Number(safeElement.x ?? safeElement.X ?? 0),
    y: Number(safeElement.y ?? safeElement.Y ?? 0),
    width: Number(safeElement.width ?? safeElement.Ancho ?? 120),
    height: Number(safeElement.height ?? safeElement.Alto ?? 30),
    fontSize: Number(safeElement.fontSize ?? safeElement.TamanoFuente ?? 16),
    fontWeight:
      String(safeElement.fontWeight ?? safeElement.Negrita ?? "400") === "1"
        ? "700"
        : String(safeElement.fontWeight ?? "400"),
    italic: Boolean(
      safeElement.italic ?? safeElement.italica ?? safeElement.Italica,
    ),
    fontStyle:
      safeElement.italic || safeElement.italica || safeElement.Italica
        ? "italic"
        : "normal",
    tipoElemento: resolvedTipoElemento,
    TipoElemento: resolvedTipoElemento,
    tipoFuente: String(
      safeElement.tipoFuente ?? safeElement.TipoFuente ?? "Default",
    ),
    TipoFuente: String(
      safeElement.TipoFuente ?? safeElement.tipoFuente ?? "Default",
    ),
    fontFamily: String(
      resolvePreviewFontFamily(
        safeElement.tipoFuente ??
          safeElement.TipoFuente ??
          safeElement.fontFamily ??
          "Default",
      ),
    ).trim(),
    Campo: resolvedTipoElemento === "rectangulo" ? null : campo,
    campo: resolvedTipoElemento === "rectangulo" ? null : campo,
    align: ["left", "center", "right"].includes(
      String(safeElement.align ?? safeElement.Alineacion ?? "").toLowerCase(),
    )
      ? String(safeElement.align ?? safeElement.Alineacion).toLowerCase()
      : "left",
    uppercase: Boolean(safeElement.uppercase ?? safeElement.Mayuscula),
    maxLines: Number(safeElement.maxLines ?? safeElement.MaxLineas ?? 1),
    zIndex: Number(safeElement.zIndex ?? safeElement.Orden ?? 1),
    sampleText: resolvedTipoElemento === "rectangulo" ? "" : fixedText,
    TextoFijo: resolvedTipoElemento === "rectangulo" ? null : fixedText,
    formatAsPrice:
      resolvedTipoElemento === "precio" ||
      normalizeContractText(campo) === "precio",
    showSymbol:
      resolvedTipoElemento === "precio" ||
      normalizeContractText(campo) === "precio",
    showNumber: isBarcodeGraphic
      ? element.showNumber === true || Number(element.ShowNumber) === 1
      : true,
    barcodeType: String(element.barcodeType ?? element.BarcodeType ?? "EAN13")
      .trim()
      .toUpperCase(),
    separatorThickness: Math.max(
      1,
      Number(element.separatorThickness ?? element.SeparatorThickness ?? 2) ||
        2,
    ),
  };
};

const migrateLegacyFormat = (
  raw = {},
  fallbackTemplate = DEFAULT_PRINT_FORMATS[0],
) => {
  const base = clone(fallbackTemplate);
  const result = {
    ...base,
    ...raw,
    __source: raw.__source ?? fallbackTemplate.__source ?? "",
    key: fallbackTemplate.key,
    name: String(raw.name ?? fallbackTemplate.name),
    paperWidth: String(raw.paperWidth ?? fallbackTemplate.paperWidth ?? "80"),
    customPaperWidth: String(
      raw.customPaperWidth ?? fallbackTemplate.customPaperWidth ?? "",
    ),
    customPaperHeight: String(
      raw.customPaperHeight ?? fallbackTemplate.customPaperHeight ?? "",
    ),
    paperHeight: String(
      raw.paperHeight ?? fallbackTemplate.paperHeight ?? "auto",
    ),
    copies: String(raw.copies ?? fallbackTemplate.copies ?? "1"),
    marginLeft: String(raw.marginLeft ?? fallbackTemplate.marginLeft ?? "0"),
    marginTop: String(raw.marginTop ?? fallbackTemplate.marginTop ?? "0"),
    marginRight: String(raw.marginRight ?? fallbackTemplate.marginRight ?? "0"),
    marginBottom: String(
      raw.marginBottom ?? fallbackTemplate.marginBottom ?? "0",
    ),
    alignment: String(raw.alignment ?? fallbackTemplate.alignment ?? "center"),
    showDescription: normalizeBoolean(
      raw.showDescription,
      fallbackTemplate.showDescription,
    ),
    showPrice: normalizeBoolean(raw.showPrice, fallbackTemplate.showPrice),
    showBarcode: normalizeBoolean(
      raw.showBarcode,
      fallbackTemplate.showBarcode,
    ),
    showStock: normalizeBoolean(raw.showStock, fallbackTemplate.showStock),
    showDate: normalizeBoolean(raw.showDate, fallbackTemplate.showDate),
    showCompanyName: normalizeBoolean(
      raw.showCompanyName,
      fallbackTemplate.showCompanyName,
    ),
    showInternalCode: normalizeBoolean(
      raw.showInternalCode,
      fallbackTemplate.showInternalCode,
    ),
    showLogo: normalizeBoolean(raw.showLogo, fallbackTemplate.showLogo),
    boldPrice: normalizeBoolean(raw.boldPrice, fallbackTemplate.boldPrice),
    previewBeforePrint: normalizeBoolean(
      raw.previewBeforePrint,
      fallbackTemplate.previewBeforePrint,
    ),
  };

  const fallbackElements = clone(fallbackTemplate.elements || []);
  const rawElements = Array.isArray(raw.elements) ? raw.elements : [];

  const elements = fallbackElements.map((fallbackElement) => {
    const legacyByKey =
      rawElements.find(
        (item) => String(item?.key ?? "") === fallbackElement.key,
      ) || {};
    const normalized = normalizeElement(legacyByKey, fallbackElement);

    if (fallbackElement.key === "description") {
      normalized.visible = result.showDescription;
      normalized.fontSize =
        parseInt(String(raw.descriptionFontSize ?? normalized.fontSize), 10) ||
        normalized.fontSize;
      normalized.align = String(raw.alignment ?? normalized.align);
    }
    if (fallbackElement.key === "price") {
      normalized.visible = result.showPrice;
      normalized.fontSize =
        parseInt(String(raw.priceFontSize ?? normalized.fontSize), 10) ||
        normalized.fontSize;
      normalized.align = String(raw.alignment ?? normalized.align);
      normalized.fontWeight = result.boldPrice ? "700" : normalized.fontWeight;
    }
    if (fallbackElement.key === "barcode") {
      normalized.visible = result.showBarcode;
      normalized.showNumber = normalizeBoolean(
        raw.showBarcodeNumber,
        normalized.showNumber,
      );
    }
    if (fallbackElement.key === "stock") {
      normalized.visible = result.showStock;
    }
    if (fallbackElement.key === "date") {
      normalized.visible = result.showDate;
    }
    if (fallbackElement.key === "companyName") {
      normalized.visible = result.showCompanyName;
    }
    if (fallbackElement.key === "internalCode") {
      normalized.visible = result.showInternalCode;
    }
    if (fallbackElement.key === "logo") {
      normalized.visible = result.showLogo;
    }
    if (
      fallbackElement.type === "separator" ||
      fallbackElement.key === "separator"
    ) {
      normalized.visible = true;
      normalized.maxLines = 1;
    }

    return normalized;
  });

  result.elements = elements;
  return result;
};

const normalizeSqlPrintFormat = (
  raw = {},
  fallbackTemplate = DEFAULT_PRINT_FORMATS[0],
) => {
  const rawElements = Array.isArray(raw.elements) ? raw.elements : [];
  const elements = rawElements.map((element) => normalizeSqlElement(element));
  const fallbackWidthMm = toInt(fallbackTemplate.paperWidth, 80);
  const widthMm = (() => {
    const explicitWidth = toInt(
      raw.AnchoPapelMm ?? raw.anchoPapelMm ?? raw.paperWidthMm,
      0,
    );
    if (explicitWidth > 0) {
      return explicitWidth;
    }

    const paperWidth = String(raw.paperWidth ?? "")
      .trim()
      .toLowerCase();
    const customWidth = toInt(
      raw.customPaperWidth ?? raw.AnchoPapelMm ?? raw.anchoPapelMm,
      0,
    );
    if (paperWidth === "custom" && customWidth > 0) {
      return customWidth;
    }

    const parsedPaperWidth = toInt(raw.paperWidth, 0);
    if (parsedPaperWidth > 0) {
      return parsedPaperWidth;
    }

    return fallbackWidthMm;
  })();
  const heightMm = (() => {
    const explicitHeight = toInt(
      raw.AltoMm ?? raw.altoMm ?? raw.paperHeightMm,
      0,
    );
    if (explicitHeight > 0) {
      return explicitHeight;
    }

    const customHeight = toInt(raw.customPaperHeight, 0);
    if (customHeight > 0) {
      return customHeight;
    }

    return 0;
  })();

  return {
    ...fallbackTemplate,
    ...raw,
    __source: "SQL",
    key: String(
      raw.key ?? raw.Codigo ?? raw.codigo ?? fallbackTemplate.key ?? "",
    ).trim(),
    name: String(raw.name ?? raw.Nombre ?? fallbackTemplate.name ?? ""),
    description: String(
      raw.description ?? raw.Descripcion ?? fallbackTemplate.description ?? "",
    ),
    paperWidth: widthMm === 58 || widthMm === 80 ? String(widthMm) : "custom",
    customPaperWidth:
      widthMm === 58 || widthMm === 80
        ? ""
        : String(
            raw.customPaperWidth ??
              raw.AnchoPapelMm ??
              raw.anchoPapelMm ??
              widthMm ??
              "",
          ),
    customPaperHeight:
      heightMm > 0
        ? String(heightMm)
        : String(
            raw.customPaperHeight ?? fallbackTemplate.customPaperHeight ?? "",
          ),
    paperHeight:
      heightMm > 0
        ? "custom"
        : String(raw.paperHeight ?? fallbackTemplate.paperHeight ?? "auto"),
    copies: String(raw.copies ?? fallbackTemplate.copies ?? "1"),
    marginLeft: String(
      raw.marginLeft ??
        raw.MargenIzq ??
        raw.MargenIzqMm ??
        fallbackTemplate.marginLeft ??
        "0",
    ),
    marginTop: String(
      raw.marginTop ??
        raw.MargenSub ??
        raw.MargenSupMm ??
        fallbackTemplate.marginTop ??
        "0",
    ),
    marginRight: String(
      raw.marginRight ??
        raw.MargenDer ??
        raw.MargenDerMm ??
        fallbackTemplate.marginRight ??
        "0",
    ),
    marginBottom: String(
      raw.marginBottom ??
        raw.MargenInf ??
        raw.MargenInfMm ??
        fallbackTemplate.marginBottom ??
        "0",
    ),
    alignment: String(raw.alignment ?? fallbackTemplate.alignment ?? "center"),
    showDescription: elements.some(
      (item) =>
        item.visible &&
        normalizeContractText(
          item.Campo ?? item.campo ?? item.valueKey ?? item.key ?? "",
        ) === "descripcion",
    ),
    showPrice: elements.some(
      (item) =>
        item.visible &&
        normalizeContractText(
          item.Campo ?? item.campo ?? item.valueKey ?? item.key ?? "",
        ) === "precio",
    ),
    showBarcode: elements.some(
      (item) =>
        item.visible &&
        normalizeContractText(
          item.Campo ?? item.campo ?? item.valueKey ?? item.key ?? "",
        ) === "codigobarra",
    ),
    showStock: elements.some(
      (item) =>
        item.visible &&
        normalizeContractText(
          item.Campo ?? item.campo ?? item.valueKey ?? item.key ?? "",
        ) === "stock",
    ),
    showDate: elements.some(
      (item) =>
        item.visible &&
        normalizeContractText(
          item.Campo ?? item.campo ?? item.valueKey ?? item.key ?? "",
        ) === "fecha",
    ),
    showCompanyName: elements.some(
      (item) =>
        item.visible &&
        normalizeContractText(
          item.Campo ?? item.campo ?? item.valueKey ?? item.key ?? "",
        ) === "empresa",
    ),
    showInternalCode: elements.some(
      (item) =>
        item.visible &&
        normalizeContractText(
          item.Campo ?? item.campo ?? item.valueKey ?? item.key ?? "",
        ) === "codigoarticulo",
    ),
    showLogo: elements.some(
      (item) =>
        item.visible &&
        normalizeContractText(
          item.Campo ?? item.campo ?? item.valueKey ?? item.key ?? "",
        ) === "logo",
    ),
    boldPrice: Boolean(
      elements.find((item) => String(item.key ?? "").toLowerCase() === "price")
        ?.fontWeight === "700",
    ),
    previewBeforePrint: normalizeBoolean(
      raw.previewBeforePrint,
      fallbackTemplate.previewBeforePrint,
    ),
    elements,
  };
};

const normalizeFormatKey = (key = "", index = 0) => {
  const normalized = String(key ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "gondola" || normalized === "góndola") return "gondola";
  if (normalized === "product" || normalized === "producto") return "product";
  if (normalized === "small" || normalized === "chico") return "small";
  if (normalized === "custom" || normalized === "personalizado")
    return "custom";
  return PRINT_FORMAT_KEYS[index] || PRINT_FORMAT_KEYS[0];
};

export const normalizePrintConfig = (savedConfig) => {
  let parsed = savedConfig;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch (error) {
      parsed = null;
    }
  }

  const sourceObject = Array.isArray(parsed)
    ? PRINT_FORMAT_KEYS.reduce((acc, key, index) => {
        acc[key] = parsed[index];
        return acc;
      }, {})
    : parsed && typeof parsed === "object"
      ? parsed
      : {};

  const normalized = PRINT_FORMAT_KEYS.reduce((acc, key, index) => {
    const template = DEFAULT_PRINT_CONFIG[key] || DEFAULT_PRINT_FORMATS[index];
    const candidate =
      sourceObject[key] ||
      sourceObject[index] ||
      sourceObject[normalizeFormatKey(key, index)] ||
      sourceObject[normalizeFormatKey(template.name, index)] ||
      {};

    const sourceTag = String(
      candidate.__source ?? sourceObject.__source ?? "",
    ).trim();
    const normalizedFormat =
      sourceTag.toUpperCase() === "SQL"
        ? normalizeSqlPrintFormat({ ...candidate, key }, template)
        : migrateLegacyFormat({ ...candidate, key }, template);
    if (sourceTag) {
      normalizedFormat.__source = sourceTag;
    }
    acc[key] = normalizedFormat;
    return acc;
  }, {});

  return normalized;
};

export const normalizePrintFormats = (value) => {
  return Object.values(normalizePrintConfig(value) || {});
};

export const loadPrintFormats = async () => {
  await Configuration.createTable();
  const catalogConfig = await getCatalogConfig().catch(() => null);
  const isOnlineMode =
    String(catalogConfig?.mode ?? "")
      .trim()
      .toUpperCase() === "ONLINE";
  if (__DEV__) {
    console.log("[PRINT_CONFIG] load mode", isOnlineMode ? "ONLINE" : "LOCAL");
  }

  const raw = await Configuration.getConfigValue("PRINT_FORMATS_JSON");
  const localFormats = raw ? normalizePrintConfig(raw) : null;

  if (isOnlineMode) {
    const sqlFormats = await loadPrintFormatsFromSql().catch(() => null);
    if (sqlFormats) {
      return normalizePrintConfig(sqlFormats);
    }

    if (localFormats) {
      if (__DEV__) {
        console.log("[PRINT_CONFIG] using local fallback");
      }
      return localFormats;
    }
  }

  return localFormats || normalizePrintConfig(DEFAULT_PRINT_FORMATS);
};

export const savePrintFormats = async (formats) => {
  await Configuration.createTable();
  const normalized = normalizePrintConfig(formats);
  await Configuration.setConfigValue(
    "PRINT_FORMATS_JSON",
    JSON.stringify(normalized),
  );
};

export const getDefaultPrintFormat = (key = "product") => {
  const format =
    DEFAULT_PRINT_FORMATS.find((item) => item.key === key) ||
    DEFAULT_PRINT_FORMATS[0];
  return clone(format);
};

export const getDefaultPrintFormats = () => clone(DEFAULT_PRINT_FORMATS);

export {
  loadPrintFormatsFromSql,
  savePrintFormatsToSql,
  syncPrintFormatsFromSql,
};

const formatCurrencyValue = (value, element = {}, options = {}) => {
  const amount = Number(value ?? 0);
  const decimals = Math.max(
    0,
    Number(
      options.priceDecimals ??
        options.articlePriceDecimals ??
        element.decimals ??
        cachedArticlePriceDecimals ??
        DEFAULT_ARTICLE_PRICE_DECIMALS,
    ) || 0,
  );
  if (element.showSymbol === false) {
    return amount.toLocaleString("es-AR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  return amount.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const formatDateValue = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).trim();
  }

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

const normalizeTemplateToken = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

const templateHasExplicitPriceSymbol = (template = "") =>
  /\$\s*\{(?:precio|price|valor)\}/i.test(String(template ?? ""));

const resolveTemplateText = (template, element = {}, product = {}, options = {}) => {
  const rawTemplate = String(template ?? "").trim();
  if (!rawTemplate) {
    return "";
  }
  const explicitPriceSymbol = templateHasExplicitPriceSymbol(rawTemplate);

  const companyName = String(product.companyName ?? "").trim();
  const description = String(product.descripcion ?? product.name ?? "").trim();
  const priceValue = product.precio ?? product.price1 ?? product.price ?? 0;
  const barcodeValue = String(
    product.codigoBarra ??
      product.CodigoBarra ??
      product.codigoBarras ??
      product.CodigoBarras ??
      product.barcode ??
      product.codigo ??
      product.Codigo ??
      product.code ??
      "",
  ).trim();
  const internalCodeValue = String(
    product.codigoInterno ??
      product.CodigoInterno ??
      product.codigoArticulo ??
      product.CodigoArticulo ??
      product.internalCode ??
      product.codigo ??
      product.Codigo ??
      product.code ??
      "",
  ).trim();
  const stockValue = String(product.stock ?? product.Stock ?? "").trim();
  const dateValue = formatDateValue(
    product.fechaActualizacion ?? product.FechaActualizacion ?? "",
  );

  const replacements = {
    codigo: internalCodeValue || barcodeValue,
    codigointerno: internalCodeValue || barcodeValue,
    codigoarticulo: internalCodeValue || barcodeValue,
    codigobarra: barcodeValue || internalCodeValue,
    codigobarras: barcodeValue || internalCodeValue,
    barcode: barcodeValue || internalCodeValue,
    barras: barcodeValue || internalCodeValue,
    barra: barcodeValue || internalCodeValue,
    stock: stockValue,
    fecha: dateValue,
    date: dateValue,
    empresa: companyName,
    companyname: companyName,
    razon: companyName,
    razonsocial: companyName,
    descripcion: description,
    description: description,
    precio: formatCurrencyValue(
      priceValue,
      {
        ...element,
        showSymbol: explicitPriceSymbol ? false : element.showSymbol,
      },
      options,
    ),
    price: formatCurrencyValue(
      priceValue,
      {
        ...element,
        showSymbol: explicitPriceSymbol ? false : element.showSymbol,
      },
      options,
    ),
    valor: formatCurrencyValue(
      priceValue,
      {
        ...element,
        showSymbol: explicitPriceSymbol ? false : element.showSymbol,
      },
      options,
    ),
    code: internalCodeValue || barcodeValue,
  };

  return rawTemplate
    .replace(/\{([^}]+)\}/g, (_, token) => {
      const normalized = normalizeTemplateToken(token);
      if (Object.prototype.hasOwnProperty.call(replacements, normalized)) {
        return replacements[normalized] ?? "";
      }
      return "";
    })
    .trim();
};

const formatFieldValue = (element, product = {}, fallback = "", options = {}) => {
  return renderElementValue(element, product, fallback, options);
};

const resolveBarcodeType = (value) => {
  const type = String(value ?? "")
    .trim()
    .toUpperCase();
  if (type === "EAN8") return 3;
  if (type === "CODE39") return 4;
  if (type === "CODE128") return 8;
  return 2;
};

export const renderPrintLayout = (
  formatConfig = {},
  product = {},
  options = {},
) => {
  const resolvedProduct = {
    ...product,
    companyName: String(
      options.companyName ?? product.companyName ?? "",
    ).trim(),
  };
  const source = String(formatConfig.__source ?? options.source ?? "")
    .trim()
    .toUpperCase();
  const isSqlSource = source === "SQL";
  const fallbackTemplate =
    DEFAULT_PRINT_FORMATS.find((item) => item.key === formatConfig.key) ||
    DEFAULT_PRINT_FORMATS[0];
  const format = isSqlSource
    ? normalizeSqlPrintFormat(formatConfig, fallbackTemplate)
    : migrateLegacyFormat(formatConfig, fallbackTemplate);
  const paperWidthPx = getPaperWidthPx(format);
  const paperHeightPx = getPaperHeightPx(format, paperWidthPx);
  const paperWidthMm = getPaperWidthMm(format);
  const scale = paperWidthPx / BASE_DESIGN_WIDTH;

  const rawElements = Array.isArray(format.elements) ? format.elements : [];
  const mappedElements = rawElements
    .map((element, index) => {
      const safeElement =
        element && typeof element === "object" && !Array.isArray(element)
          ? element
          : {};
      const item = isSqlSource
        ? { ...safeElement }
        : normalizeElement(safeElement);
      if (isSqlSource) {
        item.key = String(item.key ?? item.valueKey ?? "").trim();
        item.valueKey = String(item.valueKey ?? item.key ?? "").trim();
        item.align = String(item.align ?? safeElement.align ?? "left").trim();
        item.type = String(item.type ?? "text").trim();
        item.tipoFuente = String(
          item.tipoFuente ||
            safeElement.TipoFuente ||
            safeElement.tipoFuente ||
            safeElement.fontFamily ||
            "Default",
        ).trim();
        item.fontFamily = String(
          resolvePreviewFontFamily(
            item.tipoFuente || item.fontFamily || "Default",
          ),
        ).trim();
      }
      const rawAlign = String(
        safeElement.Alineacion ??
          safeElement.alineacion ??
          safeElement.align ??
          "",
      ).trim();
      const normalizedAlign = String(item.align ?? rawAlign ?? "left").trim();
      const rawTipoFuente = String(
        safeElement.TipoFuente ??
          safeElement.tipoFuente ??
          safeElement.fontFamily ??
          "",
      ).trim();
      const normalizedTipoFuente = String(
        item.tipoFuente || rawTipoFuente || "Default",
      ).trim();
      const visible = isSqlSource
        ? item.visible
        : item.visible &&
          !(item.key === "description" && format.showDescription === false) &&
          !(item.key === "price" && format.showPrice === false) &&
          !(item.key === "barcode" && format.showBarcode === false) &&
          !(item.key === "stock" && format.showStock === false) &&
          !(item.key === "date" && format.showDate === false) &&
          !(item.key === "companyName" && format.showCompanyName === false) &&
          !(item.key === "internalCode" && format.showInternalCode === false) &&
          !(item.key === "logo" && format.showLogo === false);

      return {
        ...item,
        editorFontSize: item.fontSize,
        visible,
        rawAlign,
        normalizedAlign,
        renderedAlign: normalizedAlign,
        x: Math.round(Number(item.x ?? 0) * scale),
        y: Math.round(Number(item.y ?? 0) * scale),
        width: Math.round(Number(item.width ?? 0) * scale),
        height: Math.round(Number(item.height ?? 0) * scale),
        fontSize: Math.max(8, Math.round(item.fontSize * scale)),
        italic: Boolean(item.italic),
        fontStyle: item.italic ? "italic" : "normal",
        tipoFuente: normalizedTipoFuente,
        fontFamily: String(
          resolvePreviewFontFamily(
            normalizedTipoFuente || item.fontFamily || "Default",
          ),
        ).trim(),
        separatorThickness: Math.max(
          1,
          Math.round((Number(item.separatorThickness ?? 2) || 2) * scale),
        ),
        orden: Number.isFinite(Number(item.orden ?? item.Orden ?? item.zIndex))
          ? Number(item.orden ?? item.Orden ?? item.zIndex)
          : index + 1,
        Orden: Number.isFinite(Number(item.orden ?? item.Orden ?? item.zIndex))
          ? Number(item.orden ?? item.Orden ?? item.zIndex)
          : index + 1,
        sunmiFontSize: mapEditorFontSizeToSunmi(
          item.fontSize,
          item.key || item.valueKey || item.type,
          paperWidthMm,
        ),
        value: renderElementValue(
          item,
          resolvedProduct,
          options.fallbackText || "",
          options,
        ),
        barcodeSymbology: resolveBarcodeType(item.barcodeType),
        renderKey: `${String(
          item.key || item.valueKey || item.type || "item",
        ).trim()}-${index + 1}`,
      };
    })
    .filter((item) => item.visible)
    .filter((item, index, allItems) => {
      const reason = getDuplicateTextElementReason(item, index, allItems);
      if (reason && __DEV__) {
        console.log(
          "DUPLICADO IGNORADO:",
          `${String(item.TipoElemento ?? item.tipoElemento ?? item.type ?? "")} | ${String(
            item.Campo ?? item.campo ?? item.key ?? "",
          )} | ${String(item.TextoFijo ?? item.textoFijo ?? item.sampleText ?? "")} | ${reason}`,
        );
      }
      return !reason;
    })
    .sort(
      (a, b) =>
        a.orden - b.orden ||
        a.zIndex - b.zIndex ||
        String(a.key || "").localeCompare(String(b.key || "")),
    );

  if (__DEV__) {
    console.log(
      "TEMPLATE SIZE:",
      `AnchoPapelMm=${paperWidthMm}`,
      `AltoMm=${String(format.customPaperHeight ?? format.paperHeight ?? "")}`,
      `canvasWidthPx=${paperWidthPx}`,
      `canvasHeightPx=${paperHeightPx}`,
    );
    console.log("[APP_LAYOUT] source", source || "LOCAL");
    console.log("[APP_LAYOUT] raw elements", rawElements.length);
    rawElements.forEach((element) => {
      const safeElement =
        element && typeof element === "object" && !Array.isArray(element)
          ? element
          : {};
      const campo = String(
        safeElement.Campo ??
          safeElement.campo ??
          safeElement.valueKey ??
          safeElement.key ??
          "Item",
      ).trim();
      const rawAlign = String(
        safeElement.Alineacion ??
          safeElement.alineacion ??
          safeElement.align ??
          "",
      ).trim();
      const rawTipoFuente = String(
        safeElement.TipoFuente ??
          safeElement.tipoFuente ??
          safeElement.fontFamily ??
          "",
      ).trim();
      console.log(
        "[APP_LAYOUT] raw item",
        `Campo ${campo}`,
        `TipoElemento ${String(safeElement.TipoElemento ?? safeElement.tipoElemento ?? safeElement.type ?? "text")}`,
        `type ${String(safeElement.type ?? "text")}`,
        `key ${String(safeElement.key ?? "")}`,
        `visible ${Boolean(safeElement.visible)}`,
        `align ${rawAlign || "left"}`,
        `tipoFuente ${rawTipoFuente || "Default"}`,
      );
    });
    mappedElements.forEach((item) => {
      const campo = String(
        item.Campo ?? item.campo ?? item.key ?? "Item",
      ).trim();
      console.log(
        "[APP_LAYOUT] normalized item",
        `Campo ${campo}`,
        `TipoElemento ${String(item.TipoElemento ?? item.tipoElemento ?? item.type ?? "text")}`,
        `type ${String(item.type ?? "")}`,
        `key ${String(item.key ?? "")}`,
        `visible ${Boolean(item.visible)}`,
        `align ${String(item.renderedAlign ?? item.align ?? "left")}`,
        `tipoFuente ${String(item.tipoFuente ?? "Default")}`,
      );
    });
    mappedElements.forEach((item) => {
      const campo = String(
        item.Campo ?? item.campo ?? item.key ?? "Item",
      ).trim();
      const finalAlign = String(item.renderedAlign ?? item.align ?? "left");
      console.log(
        "[APP_LAYOUT] final item",
        `Campo ${campo}`,
        `Orden ${String(item.orden ?? item.Orden ?? item.zIndex ?? 0)}`,
        `TipoElemento ${String(item.TipoElemento ?? item.tipoElemento ?? item.type ?? "text")}`,
        `type ${String(item.type ?? "")}`,
        `key ${String(item.key ?? "")}`,
        `visible ${Boolean(item.visible)}`,
        `align ${finalAlign}`,
        `tipoFuente ${String(item.tipoFuente ?? "Default")}`,
        `fontFamily ${String(item.fontFamily ?? "sans-serif")}`,
        `italic ${Boolean(item.italic)}`,
        `bold ${String(item.fontWeight ?? "400") === "700"}`,
      );
    });
    console.log("ELEMENTOS RENDERIZADOS:");
    mappedElements.forEach((item) => {
      console.log(
        `${String(item.orden ?? item.Orden ?? item.zIndex ?? 0)} | ${String(
          item.TipoElemento ?? item.tipoElemento ?? item.type ?? "text",
        )} | ${String(item.Campo ?? item.campo ?? item.key ?? "")} | ${String(
          item.TextoFijo ?? item.textoFijo ?? item.sampleText ?? "",
        )} | ${String(item.x ?? 0)} | ${String(item.y ?? 0)} | ${String(
          item.width ?? 0,
        )} | ${String(item.height ?? 0)} | ${String(item.value ?? "")}`,
      );
    });
    console.log("[APP_LAYOUT] final items", mappedElements.length);
  }

  return {
    format,
    paperWidthPx,
    paperHeightPx,
    paperWidthMm,
    scale,
    items: mappedElements,
  };
};

export const buildPrintableLayout = (
  formatConfig = {},
  product = {},
  options = {},
) => {
  const layout = renderPrintLayout(formatConfig, product, options);

  if (__DEV__) {
    const formatKey =
      String(layout?.format?.key ?? formatConfig?.key ?? "product").trim() ||
      "product";
    const visibleItems = Array.isArray(layout?.items) ? layout.items : [];
    console.log(`[APP_LAYOUT] ${formatKey} items ${visibleItems.length}`);
    console.log(
      "[APP_LAYOUT] visible Empresa",
      Boolean(
        visibleItems.find((item) => item.key === "companyName")?.visible ??
        false,
      ),
    );
    console.log(
      "[APP_LAYOUT] visible CodigoBarra",
      Boolean(
        visibleItems.find((item) => item.key === "barcode")?.visible ?? false,
      ),
    );
    console.log("[PREVIEW] format", formatKey);
    console.log("[PREVIEW] items", visibleItems.length);
  }

  return layout;
};

export const buildRenderedElements = (
  formatConfig = {},
  product = {},
  options = {},
) => {
  const layout = renderPrintLayout(formatConfig, product, options);
  return Array.isArray(layout.items) ? layout.items : [];
};

export const renderTemplatePreview = (
  template = {},
  product = {},
  options = {},
) => buildPrintableLayout(template, product, options);

export const renderPreviewFromElements = (
  renderedElements = [],
  layout = {},
) => ({
  ...layout,
  items: Array.isArray(renderedElements) ? renderedElements : [],
});

export const printFromElements = (renderedElements = [], layout = {}) => ({
  ...layout,
  items: Array.isArray(renderedElements) ? renderedElements : [],
});

export const createSampleProduct = () => ({
  descripcion: "Nivea Deo Aerosol B&W Fresh Sin Siliconas X 150 Ml.",
  codigoBarra: "4005900985712",
  codigoInterno: "12345",
  precio: 12500,
  stock: 25,
  fechaActualizacion: new Date().toISOString(),
  companyName: "Nano Distribuciones",
});

export const getDefaultPrintDeviceConfig = () => ({
  printableWidthPx: DEFAULT_PRINTABLE_WIDTH_PX,
  offsetX: DEFAULT_PRINT_OFFSET_X_PX,
  offsetY: DEFAULT_PRINT_OFFSET_Y_PX,
  scalePercent: DEFAULT_PRINT_SCALE_PERCENT,
  testMode: false,
  autoCenter: false,
  removeSystemMargin: true,
  extraTopFeedPx: DEFAULT_PRINT_EXTRA_TOP_FEED_PX,
  extraBottomFeedPx: DEFAULT_PRINT_EXTRA_BOTTOM_FEED_PX,
});

export const normalizePrintDeviceConfig = (value = {}) => {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    printableWidthPx: normalizePrintableWidthPx(
      source.printableWidthPx ?? source.PRINTABLE_WIDTH_PX,
      DEFAULT_PRINTABLE_WIDTH_PX,
    ),
    offsetX: normalizePrintOffsetPx(
      source.offsetX ?? source.printOffsetX ?? source.PRINT_OFFSET_X_PX,
      DEFAULT_PRINT_OFFSET_X_PX,
    ),
    offsetY: normalizePrintOffsetPx(
      source.offsetY ?? source.printOffsetY ?? source.PRINT_OFFSET_Y_PX,
      DEFAULT_PRINT_OFFSET_Y_PX,
    ),
    scalePercent: normalizePrintScalePercent(
      source.scalePercent ??
        source.printScalePercent ??
        source.PRINT_SCALE_PERCENT,
      DEFAULT_PRINT_SCALE_PERCENT,
    ),
    testMode: normalizePrintModeFlag(
      source.testMode ?? source.printTestMode ?? source.PRINT_TEST_MODE,
      false,
    ),
    autoCenter: normalizePrintModeFlag(
      source.autoCenter ?? source.printAutoCenter ?? source.PRINT_AUTO_CENTER,
      false,
    ),
    removeSystemMargin: normalizePrintModeFlag(
      source.removeSystemMargin ??
        source.printRemoveSystemMargin ??
        source.PRINT_REMOVE_SYSTEM_MARGIN,
      true,
    ),
    extraTopFeedPx: normalizePrintFeedPx(
      source.extraTopFeedPx ??
        source.printExtraTopFeedPx ??
        source.PRINT_EXTRA_TOP_FEED_PX,
      DEFAULT_PRINT_EXTRA_TOP_FEED_PX,
    ),
    extraBottomFeedPx: normalizePrintFeedPx(
      source.extraBottomFeedPx ??
        source.printExtraBottomFeedPx ??
        source.PRINT_EXTRA_BOTTOM_FEED_PX,
      DEFAULT_PRINT_EXTRA_BOTTOM_FEED_PX,
    ),
  };
};

export const loadPrintDeviceConfig = async () => {
  const storageKeys = await resolvePrintDeviceStorageKeys();
  let rawValue = null;

  for (const storageKey of storageKeys) {
    rawValue = await AsyncStorage.getItem(storageKey).catch(() => null);
    if (rawValue) {
      break;
    }
  }

  if (rawValue) {
    try {
      return normalizePrintDeviceConfig(JSON.parse(rawValue));
    } catch (error) {
      if (__DEV__) {
        console.log(
          "[PRINT_DEVICE_CONFIG] invalid local payload, falling back to legacy",
          error?.message || error,
        );
      }
    }
  }

  const legacyConfig = await readLegacyPrintDeviceConfig().catch(() =>
    getDefaultPrintDeviceConfig(),
  );
  const storageKey = storageKeys[0] || buildPrintDeviceStorageKey("default");
  await AsyncStorage.setItem(
    storageKey,
    JSON.stringify({ version: 1, ...legacyConfig }),
  ).catch(() => {});
  return legacyConfig;
};

export const savePrintDeviceConfig = async (config = {}) => {
  const normalized = normalizePrintDeviceConfig(config);
  const storageKeys = await resolvePrintDeviceStorageKeys();
  const payload = JSON.stringify({
    version: 1,
    ...normalized,
  });

  await Promise.all(
    storageKeys.map((storageKey) => AsyncStorage.setItem(storageKey, payload)),
  );
  return normalized;
};

export const buildPrintPreviewLayout = (
  formatConfig = {},
  product = {},
  deviceConfig = {},
) => {
  const printerConfig = normalizePrintDeviceConfig(deviceConfig);
  const layout = buildPrintableLayout(formatConfig, product, printerConfig);
  const printableWidthPx = Math.max(
    1,
    printerConfig.printableWidthPx || DEFAULT_PRINTABLE_WIDTH_PX,
  );
  const baseWidth = Math.max(1, Number(layout?.paperWidthPx) || 1);
  const scalePercent = Math.max(
    10,
    Math.min(
      400,
      Number(printerConfig.scalePercent) || DEFAULT_PRINT_SCALE_PERCENT,
    ),
  );
  const scale = (printableWidthPx / baseWidth) * (scalePercent / 100);
  const offsetX = Math.round(Number(printerConfig.offsetX) || 0);
  const offsetY = Math.round(Number(printerConfig.offsetY) || 0);
  const translatedItems = Array.isArray(layout.items)
    ? layout.items.map((item) => ({
        ...item,
        x: Math.round((Number(item.x ?? 0) || 0) * scale + offsetX),
        y: Math.round((Number(item.y ?? 0) || 0) * scale + offsetY),
        width: Math.max(1, Math.round((Number(item.width ?? 0) || 0) * scale)),
        height: Math.max(
          1,
          Math.round((Number(item.height ?? 0) || 0) * scale),
        ),
        fontSize: Math.max(
          8,
          Math.round((Number(item.fontSize ?? 16) || 16) * scale),
        ),
        separatorThickness: Math.max(
          1,
          Math.round((Number(item.separatorThickness ?? 2) || 2) * scale),
        ),
      }))
    : [];

  return {
    ...layout,
    scale: 1,
    paperWidthPx: printableWidthPx,
    paperHeightPx: Math.max(
      1,
      Math.round((Number(layout?.paperHeightPx ?? 1) || 1) * scale) +
        Math.max(0, offsetY),
    ),
    items: translatedItems,
    printableWidthPx,
    printOffsetX: offsetX,
    printOffsetY: offsetY,
    printScalePercent: scalePercent,
    printTestMode: printerConfig.testMode,
    printAutoCenter: printerConfig.autoCenter,
    printRemoveSystemMargin: printerConfig.removeSystemMargin,
    printExtraTopFeedPx: printerConfig.extraTopFeedPx,
    printExtraBottomFeedPx: printerConfig.extraBottomFeedPx,
  };
};
