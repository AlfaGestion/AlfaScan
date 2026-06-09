import Configuration from "@db/Configuration";

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

const BASE_DESIGN_WIDTH = 320;

const clone = (value) => JSON.parse(JSON.stringify(value));

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
  ...element,
});

const buildElements = (elements = []) => elements.map((item) => createElement(item));

const baseTemplate = {
  name: "",
  paperWidth: "80",
  customPaperWidth: "",
  customPaperHeight: "",
  paperHeight: "auto",
  copies: "1",
  marginTop: "0",
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
  elements: buildElements([
    {
      key: "description",
      label: "Descripción",
      type: "text",
      visible: true,
      x: 16,
      y: 18,
      width: 288,
      height: 56,
      fontSize: 18,
      fontWeight: "700",
      align: "center",
      maxLines: 2,
      zIndex: 10,
      valueKey: "description",
      sampleText: "Descripción producto",
    },
    {
      key: "price",
      label: "Precio",
      type: "text",
      visible: true,
      x: 16,
      y: 88,
      width: 288,
      height: 76,
      fontSize: 32,
      fontWeight: "700",
      align: "center",
      maxLines: 1,
      zIndex: 20,
      valueKey: "price",
      formatAsPrice: true,
      sampleText: "$ 12.500,00",
    },
    {
      key: "barcode",
      label: "Código de barra",
      type: "barcode",
      visible: true,
      x: 18,
      y: 176,
      width: 284,
      height: 74,
      fontSize: 12,
      fontWeight: "400",
      align: "center",
      maxLines: 1,
      zIndex: 30,
      valueKey: "barcode",
      barcodeType: "EAN13",
      showNumber: true,
      sampleText: "4005900985712",
    },
    {
      key: "internalCode",
      label: "Código interno",
      type: "text",
      visible: false,
      x: 16,
      y: 260,
      width: 140,
      height: 28,
      fontSize: 12,
      fontWeight: "400",
      align: "left",
      maxLines: 1,
      zIndex: 15,
      valueKey: "internalCode",
      sampleText: "Interno: 12345",
    },
    {
      key: "stock",
      label: "Stock",
      type: "text",
      visible: false,
      x: 16,
      y: 288,
      width: 120,
      height: 26,
      fontSize: 12,
      fontWeight: "400",
      align: "left",
      maxLines: 1,
      zIndex: 15,
      valueKey: "stock",
      sampleText: "Stock: 25",
    },
    {
      key: "date",
      label: "Fecha",
      type: "text",
      visible: false,
      x: 168,
      y: 288,
      width: 136,
      height: 26,
      fontSize: 12,
      fontWeight: "400",
      align: "right",
      maxLines: 1,
      zIndex: 15,
      valueKey: "date",
      sampleText: "09/06/2026 10:47",
    },
    {
      key: "companyName",
      label: "Nombre empresa",
      type: "text",
      visible: false,
      x: 16,
      y: 8,
      width: 288,
      height: 22,
      fontSize: 12,
      fontWeight: "700",
      align: "center",
      maxLines: 1,
      zIndex: 5,
      valueKey: "companyName",
      sampleText: "Alfa Gestión",
    },
    {
      key: "logo",
      label: "Logo",
      type: "logo",
      visible: false,
      x: 16,
      y: 44,
      width: 88,
      height: 40,
      fontSize: 12,
      fontWeight: "700",
      align: "center",
      maxLines: 1,
      zIndex: 8,
      valueKey: "logo",
      sampleText: "ALFA",
    },
  ]),
};

const gondolaTemplate = {
  ...clone(baseTemplate),
  key: "gondola",
  name: "Góndola",
  paperWidth: "80",
  paperHeight: "auto",
  showDate: true,
  elements: buildElements([
    { ...baseTemplate.elements[6], visible: true, y: 8 },
    { ...baseTemplate.elements[0], x: 16, y: 30, width: 288, fontSize: 24, height: 60, align: "center" },
    { ...baseTemplate.elements[1], x: 16, y: 92, width: 288, fontSize: 38, height: 82, align: "center" },
    { ...baseTemplate.elements[2], x: 18, y: 184, width: 284, height: 70, visible: true, showNumber: true },
    { ...baseTemplate.elements[5], visible: true, x: 160, y: 262, width: 144 },
  ]),
};

const productTemplate = {
  ...clone(baseTemplate),
  key: "product",
  name: "Producto",
  paperWidth: "58",
  paperHeight: "auto",
  elements: buildElements([
    { ...baseTemplate.elements[2], x: 18, y: 14, width: 284, height: 72, visible: true },
    { ...baseTemplate.elements[0], x: 16, y: 96, width: 288, fontSize: 18, height: 52, align: "center", visible: true },
    { ...baseTemplate.elements[1], x: 16, y: 154, width: 288, fontSize: 28, height: 64, align: "center", visible: true },
    { ...baseTemplate.elements[4], visible: false },
    { ...baseTemplate.elements[3], visible: false },
    { ...baseTemplate.elements[5], visible: false },
    { ...baseTemplate.elements[6], visible: false },
    { ...baseTemplate.elements[7], visible: false },
  ]),
};

const smallTemplate = {
  ...clone(baseTemplate),
  key: "small",
  name: "Chico",
  paperWidth: "58",
  paperHeight: "auto",
  elements: buildElements([
    { ...baseTemplate.elements[0], x: 14, y: 14, width: 292, fontSize: 14, height: 40, visible: true },
    { ...baseTemplate.elements[1], x: 14, y: 62, width: 292, fontSize: 28, height: 58, visible: true },
    { ...baseTemplate.elements[2], x: 24, y: 128, width: 274, height: 56, visible: true, showNumber: false, barcodeType: "CODE128" },
    { ...baseTemplate.elements[6], visible: false },
    { ...baseTemplate.elements[7], visible: false },
    { ...baseTemplate.elements[3], visible: false },
    { ...baseTemplate.elements[4], visible: false },
    { ...baseTemplate.elements[5], visible: false },
  ]),
};

const customTemplate = {
  ...clone(baseTemplate),
  key: "custom",
  name: "Personalizado",
  paperWidth: "80",
  paperHeight: "auto",
  showStock: true,
  showDate: true,
  showCompanyName: true,
  showInternalCode: true,
  showLogo: true,
  elements: buildElements([
    { ...baseTemplate.elements[6], visible: true, x: 16, y: 8 },
    { ...baseTemplate.elements[7], visible: true, x: 16, y: 30, width: 72, height: 36 },
    { ...baseTemplate.elements[0], visible: true, x: 16, y: 76, width: 288, fontSize: 18, height: 52 },
    { ...baseTemplate.elements[1], visible: true, x: 16, y: 132, width: 288, fontSize: 28, height: 66 },
    { ...baseTemplate.elements[3], visible: true, x: 16, y: 208, width: 144, height: 24 },
    { ...baseTemplate.elements[4], visible: true, x: 16, y: 234, width: 100, height: 24 },
    { ...baseTemplate.elements[5], visible: true, x: 168, y: 234, width: 136, height: 24, align: "right" },
    { ...baseTemplate.elements[2], visible: true, x: 18, y: 268, width: 284, height: 72, barcodeType: "EAN13" },
  ]),
};

const DEFAULT_PRINT_FORMATS = [gondolaTemplate, productTemplate, smallTemplate, customTemplate];
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
  if (Number.isFinite(custom) && custom >= 200) {
    return Math.min(custom, 420);
  }

  return 320;
};

const getPaperHeightPx = (format = {}, paperWidthPx = 320) => {
  const explicit = parseInt(String(format.customPaperHeight ?? "").trim(), 10);
  if (Number.isFinite(explicit) && explicit >= 120) {
    return explicit;
  }

  const maxElementBottom = (Array.isArray(format.elements) ? format.elements : DEFAULT_PRINT_FORMATS[0].elements).reduce(
    (max, element) => Math.max(max, Number(element.y ?? 0) + Number(element.height ?? 0)),
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

const normalizeElement = (element = {}, fallback = {}) => {
  const base = createElement(fallback);
  const next = createElement({ ...base, ...element });
  next.key = String(next.key ?? fallback.key ?? "").trim();
  next.label = String(next.label ?? fallback.label ?? next.key).trim();
  next.type = String(next.type ?? fallback.type ?? "text").trim();
  next.visible = normalizeBoolean(element.visible, fallback.visible ?? true);
  next.x = Number.isFinite(Number(element.x)) ? Number(element.x) : Number(base.x ?? 0);
  next.y = Number.isFinite(Number(element.y)) ? Number(element.y) : Number(base.y ?? 0);
  next.width = Number.isFinite(Number(element.width)) ? Number(element.width) : Number(base.width ?? 120);
  next.height = Number.isFinite(Number(element.height)) ? Number(element.height) : Number(base.height ?? 36);
  next.fontSize = Number.isFinite(Number(element.fontSize)) ? Number(element.fontSize) : Number(base.fontSize ?? 16);
  next.fontWeight = String(element.fontWeight ?? fallback.fontWeight ?? base.fontWeight ?? "400");
  next.align = String(element.align ?? fallback.align ?? base.align ?? "left");
  next.color = String(element.color ?? fallback.color ?? base.color ?? "#111827");
  next.uppercase = normalizeBoolean(element.uppercase, fallback.uppercase ?? false);
  next.maxLines = Math.max(1, parseInt(String(element.maxLines ?? fallback.maxLines ?? 1), 10) || 1);
  next.zIndex = Number.isFinite(Number(element.zIndex)) ? Number(element.zIndex) : Number(base.zIndex ?? 1);
  next.sampleText = String(element.sampleText ?? fallback.sampleText ?? base.sampleText ?? "").trim();
  next.valueKey = String(element.valueKey ?? fallback.valueKey ?? base.valueKey ?? "").trim();
  next.formatAsPrice = normalizeBoolean(element.formatAsPrice, fallback.formatAsPrice ?? false);
  next.showSymbol = normalizeBoolean(element.showSymbol, fallback.showSymbol ?? true);
  next.decimals = Math.max(0, parseInt(String(element.decimals ?? fallback.decimals ?? 2), 10) || 0);
  next.thousandSeparator = normalizeBoolean(element.thousandSeparator, fallback.thousandSeparator ?? true);
  next.barcodeType = String(element.barcodeType ?? fallback.barcodeType ?? "EAN13").trim().toUpperCase();
  next.showNumber = normalizeBoolean(element.showNumber, fallback.showNumber ?? true);
  return next;
};

const migrateLegacyFormat = (raw = {}, fallbackTemplate = DEFAULT_PRINT_FORMATS[0]) => {
  const base = clone(fallbackTemplate);
  const result = {
    ...base,
    ...raw,
    key: fallbackTemplate.key,
    name: String(raw.name ?? fallbackTemplate.name),
    paperWidth: String(raw.paperWidth ?? fallbackTemplate.paperWidth ?? "80"),
    customPaperWidth: String(raw.customPaperWidth ?? fallbackTemplate.customPaperWidth ?? ""),
    customPaperHeight: String(raw.customPaperHeight ?? fallbackTemplate.customPaperHeight ?? ""),
    paperHeight: String(raw.paperHeight ?? fallbackTemplate.paperHeight ?? "auto"),
    copies: String(raw.copies ?? fallbackTemplate.copies ?? "1"),
    marginTop: String(raw.marginTop ?? fallbackTemplate.marginTop ?? "0"),
    marginBottom: String(raw.marginBottom ?? fallbackTemplate.marginBottom ?? "0"),
    alignment: String(raw.alignment ?? fallbackTemplate.alignment ?? "center"),
    showDescription: normalizeBoolean(raw.showDescription, fallbackTemplate.showDescription),
    showPrice: normalizeBoolean(raw.showPrice, fallbackTemplate.showPrice),
    showBarcode: normalizeBoolean(raw.showBarcode, fallbackTemplate.showBarcode),
    showStock: normalizeBoolean(raw.showStock, fallbackTemplate.showStock),
    showDate: normalizeBoolean(raw.showDate, fallbackTemplate.showDate),
    showCompanyName: normalizeBoolean(raw.showCompanyName, fallbackTemplate.showCompanyName),
    showInternalCode: normalizeBoolean(raw.showInternalCode, fallbackTemplate.showInternalCode),
    showLogo: normalizeBoolean(raw.showLogo, fallbackTemplate.showLogo),
    boldPrice: normalizeBoolean(raw.boldPrice, fallbackTemplate.boldPrice),
    previewBeforePrint: normalizeBoolean(raw.previewBeforePrint, fallbackTemplate.previewBeforePrint),
  };

  const fallbackElements = clone(fallbackTemplate.elements || []);
  const rawElements = Array.isArray(raw.elements) ? raw.elements : [];

  const elements = fallbackElements.map((fallbackElement) => {
    const legacyByKey = rawElements.find((item) => String(item?.key ?? "") === fallbackElement.key) || {};
    const normalized = normalizeElement(legacyByKey, fallbackElement);

    if (fallbackElement.key === "description") {
      normalized.visible = result.showDescription;
      normalized.fontSize = parseInt(String(raw.descriptionFontSize ?? normalized.fontSize), 10) || normalized.fontSize;
      normalized.align = String(raw.alignment ?? normalized.align);
    }
    if (fallbackElement.key === "price") {
      normalized.visible = result.showPrice;
      normalized.fontSize = parseInt(String(raw.priceFontSize ?? normalized.fontSize), 10) || normalized.fontSize;
      normalized.align = String(raw.alignment ?? normalized.align);
      normalized.fontWeight = result.boldPrice ? "700" : normalized.fontWeight;
    }
    if (fallbackElement.key === "barcode") {
      normalized.visible = result.showBarcode;
      normalized.showNumber = normalizeBoolean(raw.showBarcodeNumber, normalized.showNumber);
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

    return normalized;
  });

  result.elements = elements;
  return result;
};

const normalizeFormatKey = (key = "", index = 0) => {
  const normalized = String(key ?? "").trim().toLowerCase();
  if (normalized === "gondola" || normalized === "góndola") return "gondola";
  if (normalized === "product" || normalized === "producto") return "product";
  if (normalized === "small" || normalized === "chico") return "small";
  if (normalized === "custom" || normalized === "personalizado") return "custom";
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

  const sourceObject =
    Array.isArray(parsed)
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

    acc[key] = migrateLegacyFormat({ ...candidate, key }, template);
    return acc;
  }, {});

  return normalized;
};

export const normalizePrintFormats = (value) => {
  return Object.values(normalizePrintConfig(value));
};

export const loadPrintFormats = async () => {
  await Configuration.createTable();
  const raw = await Configuration.getConfigValue("PRINT_FORMATS_JSON");
  return normalizePrintConfig(raw);
};

export const savePrintFormats = async (formats) => {
  await Configuration.createTable();
  const normalized = normalizePrintConfig(formats);
  await Configuration.setConfigValue("PRINT_FORMATS_JSON", JSON.stringify(normalized));
};

export const getDefaultPrintFormat = (key = "product") => {
  const format = DEFAULT_PRINT_FORMATS.find((item) => item.key === key) || DEFAULT_PRINT_FORMATS[0];
  return clone(format);
};

export const getDefaultPrintFormats = () => clone(DEFAULT_PRINT_FORMATS);

const formatCurrencyValue = (value, element = {}) => {
  const amount = Number(value ?? 0);
  const decimals = Math.max(0, Number(element.decimals ?? 2) || 0);
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

const formatFieldValue = (element, product = {}, fallback = "") => {
  const key = String(element.valueKey ?? element.key ?? "").trim();
  const lookup = {
    description: product.descripcion ?? product.name ?? "",
    price: product.precio ?? product.price1 ?? 0,
    barcode: product.codigoBarra ?? product.codigoBarras ?? product.code ?? "",
    internalCode: product.codigoInterno ?? product.codigoArticulo ?? product.code ?? "",
    stock: product.stock ?? product.Stock ?? "",
    date: product.fechaActualizacion ?? product.FechaActualizacion ?? "",
    companyName: product.companyName ?? "Alfa Gestión",
    logo: "ALFA",
  };
  const raw = lookup[key];
  if (raw === undefined || raw === null || raw === "") {
    return fallback || element.sampleText || "";
  }

  if (key === "price") {
    return formatCurrencyValue(raw, element);
  }

  let value = String(raw).trim();
  if (element.uppercase) {
    value = value.toUpperCase();
  }
  return value || fallback || element.sampleText || "";
};

const resolveBarcodeType = (value) => {
  const type = String(value ?? "").trim().toUpperCase();
  if (type === "EAN8") return 3;
  if (type === "CODE39") return 4;
  if (type === "CODE128") return 8;
  return 2;
};

export const renderPrintLayout = (formatConfig = {}, product = {}, options = {}) => {
  const format = migrateLegacyFormat(formatConfig, DEFAULT_PRINT_FORMATS.find((item) => item.key === formatConfig.key) || DEFAULT_PRINT_FORMATS[0]);
  const paperWidthPx = getPaperWidthPx(format);
  const paperHeightPx = getPaperHeightPx(format, paperWidthPx);
  const scale = paperWidthPx / BASE_DESIGN_WIDTH;

  const elements = (format.elements || [])
    .map((element) => {
      const item = normalizeElement(element);
      const visible =
        item.visible &&
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
        visible,
        x: Math.round(item.x * scale),
        y: Math.round(item.y * scale),
        width: Math.round(item.width * scale),
        height: Math.round(item.height * scale),
        fontSize: Math.max(8, Math.round(item.fontSize * scale)),
        value: formatFieldValue(item, product, options.fallbackText || ""),
        barcodeSymbology: resolveBarcodeType(item.barcodeType),
      };
    })
    .filter((item) => item.visible)
    .sort((a, b) => (a.zIndex === b.zIndex ? a.y - b.y : a.zIndex - b.zIndex));

  return {
    format,
    paperWidthPx,
    paperHeightPx,
    scale,
    items: elements,
  };
};

export const createSampleProduct = () => ({
  descripcion: "Nivea Deo Aerosol B&W Fresh Sin Siliconas X 150 Ml.",
  codigoBarra: "4005900985712",
  codigoInterno: "12345",
  precio: 12500,
  stock: 25,
  fechaActualizacion: new Date().toISOString(),
  companyName: "Alfa Gestión",
});
