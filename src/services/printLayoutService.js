import Configuration from "@db/Configuration";
import { getCatalogConfig } from "@services/catalogService";
import {
  loadPrintFormatsFromSql,
  savePrintFormatsToSql,
  syncPrintFormatsFromSql,
} from "@services/printSqlService";

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
  italic: false,
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
  if (Number.isFinite(custom) && custom >= 200) {
    return Math.min(custom, 420);
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

const getPaperHeightPx = (format = {}, paperWidthPx = 320) => {
  const explicit = parseInt(String(format.customPaperHeight ?? "").trim(), 10);
  if (Number.isFinite(explicit) && explicit >= 120) {
    return explicit;
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
  const base = createElement(fallback);
  const next = createElement({ ...base, ...element });
  next.key = String(next.key ?? fallback.key ?? "").trim();
  next.label = String(next.label ?? fallback.label ?? next.key).trim();
  next.type = String(next.type ?? fallback.type ?? "text").trim();
  next.visible = normalizeBoolean(element.visible, fallback.visible ?? true);
  next.x = Number.isFinite(Number(element.x))
    ? Number(element.x)
    : Number(base.x ?? 0);
  next.y = Number.isFinite(Number(element.y))
    ? Number(element.y)
    : Number(base.y ?? 0);
  next.width = Number.isFinite(Number(element.width))
    ? Number(element.width)
    : Number(base.width ?? 120);
  next.height = Number.isFinite(Number(element.height))
    ? Number(element.height)
    : Number(base.height ?? 36);
  next.fontSize = Number.isFinite(Number(element.fontSize))
    ? Number(element.fontSize)
    : Number(base.fontSize ?? 16);
  next.fontWeight = String(
    element.fontWeight ?? fallback.fontWeight ?? base.fontWeight ?? "400",
  );
  next.align = String(element.align ?? fallback.align ?? base.align ?? "left");
  next.color = String(
    element.color ?? fallback.color ?? base.color ?? "#111827",
  );
  next.uppercase = normalizeBoolean(
    element.uppercase,
    fallback.uppercase ?? false,
  );
  next.italic = normalizeBoolean(
    element.italic ?? element.italica,
    fallback.italic ?? false,
  );
  next.maxLines = Math.max(
    1,
    parseInt(String(element.maxLines ?? fallback.maxLines ?? 1), 10) || 1,
  );
  next.zIndex = Number.isFinite(Number(element.zIndex))
    ? Number(element.zIndex)
    : Number(base.zIndex ?? 1);
  next.sampleText = String(
    element.sampleText ?? fallback.sampleText ?? base.sampleText ?? "",
  ).trim();
  next.valueKey = String(
    element.valueKey ?? fallback.valueKey ?? base.valueKey ?? "",
  ).trim();
  next.formatAsPrice = normalizeBoolean(
    element.formatAsPrice,
    fallback.formatAsPrice ?? false,
  );
  next.showSymbol = normalizeBoolean(
    element.showSymbol,
    fallback.showSymbol ?? true,
  );
  next.decimals = Math.max(
    0,
    parseInt(String(element.decimals ?? fallback.decimals ?? 2), 10) || 0,
  );
  next.thousandSeparator = normalizeBoolean(
    element.thousandSeparator,
    fallback.thousandSeparator ?? true,
  );
  next.barcodeType = String(
    element.barcodeType ?? fallback.barcodeType ?? "EAN13",
  )
    .trim()
    .toUpperCase();
  next.showNumber = normalizeBoolean(
    element.showNumber,
    fallback.showNumber ?? true,
  );
  next.separatorThickness = Math.max(
    1,
    parseInt(
      String(element.separatorThickness ?? fallback.separatorThickness ?? 2),
      10,
    ) || 1,
  );
  return next;
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
    marginTop: String(raw.marginTop ?? fallbackTemplate.marginTop ?? "0"),
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

const normalizeSqlElement = (element = {}, index = 0) => {
  const rawTipoElemento = String(
    element.TipoElemento ?? element.tipoElemento ?? element.type ?? "texto",
  ).trim();
  const tipoElemento = String(normalizeSqlContractType(rawTipoElemento)).trim();
  const rawCampo = String(
    element.Campo ?? element.campo ?? element.valueKey ?? element.key ?? "",
  ).trim();
  const campo = normalizeSqlContractCampo(tipoElemento, rawCampo);
  const rawTextoFijo = String(
    element.TextoFijo ?? element.textoFijo ?? element.sampleText ?? "",
  ).trim();
  const isVisualLine = tipoElemento === "linea";
  const key = isVisualLine
    ? "separator"
    : normalizeSqlContractValueKey(campo, tipoElemento) ||
      `element_${index + 1}`;
  const rawAlign = String(
    element.Alineacion ?? element.alineacion ?? element.align ?? "left",
  ).trim();
  const align = rawAlign || "left";
  const fontSize = Number.isFinite(
    Number(element.TamanoFuente ?? element.tamanoFuente ?? element.fontSize),
  )
    ? Number(element.TamanoFuente ?? element.tamanoFuente ?? element.fontSize)
    : 16;
  const zIndex = Number.isFinite(
    Number(element.Orden ?? element.orden ?? element.zIndex),
  )
    ? Number(element.Orden ?? element.orden ?? element.zIndex)
    : index + 1;

  return {
    key,
    valueKey: key,
    campo,
    Campo: campo,
    tipoElemento,
    TipoElemento: tipoElemento,
    type: isVisualLine
      ? "separator"
      : key === "barcode"
        ? "barcode"
        : key === "logo"
          ? "logo"
          : "text",
    label:
      rawTextoFijo ||
      String(element.Nombre ?? element.nombre ?? campo ?? key).trim() ||
      (isVisualLine ? "Separador" : campo || key),
    visible: normalizeBoolean(element.Visible ?? element.visible, true),
    x: toInt(element.X ?? element.x, 0),
    y: toInt(element.Y ?? element.y, 0),
    width: toInt(element.Ancho ?? element.ancho ?? element.width, 0),
    height: toInt(element.Alto ?? element.alto ?? element.height, 0),
    fontSize,
    fontWeight: toBool(element.Negrita ?? element.negrita, false)
      ? "700"
      : "400",
    italic: toBool(element.Italica ?? element.italica ?? element.italic, false),
    fontStyle: toBool(
      element.Italica ?? element.italica ?? element.italic,
      false,
    )
      ? "italic"
      : "normal",
    align,
    uppercase: toBool(element.Mayuscula ?? element.mayuscula, false),
    maxLines: Math.max(
      1,
      toInt(element.MaxLineas ?? element.maxLineas ?? element.maxLines, 1),
    ),
    zIndex,
    sampleText: rawTextoFijo,
    formatAsPrice: key === "price" || normalizeContractText(campo) === "precio",
    showSymbol: key === "price" || normalizeContractText(campo) === "precio",
    showNumber:
      key === "barcode"
        ? toBool(element.ShowNumber ?? element.showNumber, true)
        : true,
    barcodeType: String(element.barcodeType ?? element.BarcodeType ?? "EAN13")
      .trim()
      .toUpperCase(),
    separatorThickness: Math.max(
      1,
      toInt(element.separatorThickness ?? element.SeparatorThickness ?? 2, 2),
    ),
  };
};

const normalizeSqlPrintFormat = (
  raw = {},
  fallbackTemplate = DEFAULT_PRINT_FORMATS[0],
) => {
  const rawElements = Array.isArray(raw.elements) ? raw.elements : [];
  const elements = rawElements.map((element, index) =>
    normalizeSqlElement(element, index),
  );

  return {
    ...raw,
    __source: raw.__source ?? fallbackTemplate.__source ?? "SQL",
    key: String(raw.key ?? fallbackTemplate.key ?? "").trim(),
    name: String(raw.name ?? fallbackTemplate.name ?? ""),
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
    marginTop: String(raw.marginTop ?? fallbackTemplate.marginTop ?? "0"),
    marginBottom: String(
      raw.marginBottom ?? fallbackTemplate.marginBottom ?? "0",
    ),
    alignment: String(raw.alignment ?? fallbackTemplate.alignment ?? "center"),
    showDescription: elements.some(
      (item) =>
        item.visible && String(item.key ?? "").toLowerCase() === "description",
    ),
    showPrice: elements.some(
      (item) =>
        item.visible && String(item.key ?? "").toLowerCase() === "price",
    ),
    showBarcode: elements.some(
      (item) =>
        item.visible && String(item.key ?? "").toLowerCase() === "barcode",
    ),
    showStock: elements.some(
      (item) =>
        item.visible && String(item.key ?? "").toLowerCase() === "stock",
    ),
    showDate: elements.some(
      (item) => item.visible && String(item.key ?? "").toLowerCase() === "date",
    ),
    showCompanyName: elements.some(
      (item) =>
        item.visible && String(item.key ?? "").toLowerCase() === "companyname",
    ),
    showInternalCode: elements.some(
      (item) =>
        item.visible &&
        ["internalcode", "codigointerno", "codigoarticulo"].includes(
          String(item.key ?? "").toLowerCase(),
        ),
    ),
    showLogo: elements.some(
      (item) => item.visible && String(item.key ?? "").toLowerCase() === "logo",
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
  return Object.values(normalizePrintConfig(value));
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

const resolveTemplateText = (template, element = {}, product = {}) => {
  const rawTemplate = String(template ?? "").trim();
  if (!rawTemplate) {
    return "";
  }

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
    precio: formatCurrencyValue(priceValue, element),
    price: formatCurrencyValue(priceValue, element),
    valor: formatCurrencyValue(priceValue, element),
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

const formatFieldValue = (element, product = {}, fallback = "") => {
  const key = String(element.valueKey ?? element.key ?? "").trim();
  const normalizedKey = key.toLowerCase();
  const lookup = {
    description: product.descripcion ?? product.name ?? "",
    price: product.precio ?? product.price1 ?? 0,
    barcode:
      product.codigoBarra ??
      product.CodigoBarra ??
      product.codigoBarras ??
      product.CodigoBarras ??
      product.barcode ??
      product.codigo ??
      product.Codigo ??
      product.code ??
      "",
    internalCode:
      product.codigoInterno ??
      product.CodigoInterno ??
      product.codigoArticulo ??
      product.CodigoArticulo ??
      product.internalCode ??
      product.codigo ??
      product.Codigo ??
      product.code ??
      "",
    stock: product.stock ?? product.Stock ?? "",
    date: product.fechaActualizacion ?? product.FechaActualizacion ?? "",
    companyName: product.companyName ?? "",
    empresa: product.companyName ?? "",
    descripcion: product.descripcion ?? product.name ?? "",
    precio: product.precio ?? product.price1 ?? 0,
    codigobarra:
      product.codigoBarra ??
      product.CodigoBarra ??
      product.codigoBarras ??
      product.CodigoBarras ??
      product.barcode ??
      product.codigo ??
      product.Codigo ??
      product.code ??
      "",
    codigoarticulo:
      product.codigoInterno ??
      product.CodigoInterno ??
      product.codigoArticulo ??
      product.CodigoArticulo ??
      product.internalCode ??
      product.codigo ??
      product.Codigo ??
      product.code ??
      "",
    textofijo: element.sampleText ?? "",
    logo: "ALFA",
  };
  const raw = lookup[key] ?? lookup[normalizedKey];
  const templateValue = resolveTemplateText(
    element.sampleText,
    element,
    product,
  );
  if (templateValue) {
    return element.uppercase ? templateValue.toUpperCase() : templateValue;
  }

  if (key === "price") {
    const value = formatCurrencyValue(raw, element);
    return element.uppercase ? value.toUpperCase() : value;
  }

  if (key === "date") {
    const value = formatDateValue(raw);
    return element.uppercase ? value.toUpperCase() : value;
  }

  if (raw === undefined || raw === null || raw === "") {
    if (key === "companyName") {
      return fallback || "";
    }
    return fallback || "";
  }

  let value = String(raw).trim();
  if (element.uppercase) {
    value = value.toUpperCase();
  }
  return value || fallback || "";
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
  const format = migrateLegacyFormat(
    formatConfig,
    DEFAULT_PRINT_FORMATS.find((item) => item.key === formatConfig.key) ||
      DEFAULT_PRINT_FORMATS[0],
  );
  const source = String(
    format.__source ?? formatConfig.__source ?? options.source ?? "",
  )
    .trim()
    .toUpperCase();
  const isSqlSource = source === "SQL";
  const paperWidthPx = getPaperWidthPx(format);
  const paperHeightPx = getPaperHeightPx(format, paperWidthPx);
  const paperWidthMm = getPaperWidthMm(format);
  const scale = paperWidthPx / BASE_DESIGN_WIDTH;

  const rawElements = Array.isArray(format.elements) ? format.elements : [];
  const mappedElements = rawElements
    .map((element, index) => {
      const item = isSqlSource ? { ...element } : normalizeElement(element);
      if (isSqlSource) {
        item.key = String(item.key ?? item.valueKey ?? "").trim();
        item.valueKey = String(item.valueKey ?? item.key ?? "").trim();
        item.align = String(item.align ?? element.align ?? "left").trim();
        item.type = String(item.type ?? "text").trim();
      }
      const rawAlign = String(
        element.Alineacion ?? element.alineacion ?? element.align ?? "",
      ).trim();
      const normalizedAlign = String(item.align ?? rawAlign ?? "left").trim();
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
        separatorThickness: Math.max(
          1,
          Math.round((Number(item.separatorThickness ?? 2) || 2) * scale),
        ),
        sunmiFontSize: mapEditorFontSizeToSunmi(
          item.fontSize,
          item.key || item.valueKey || item.type,
          paperWidthMm,
        ),
        value: formatFieldValue(
          item,
          resolvedProduct,
          options.fallbackText || "",
        ),
        barcodeSymbology: resolveBarcodeType(item.barcodeType),
        renderKey: `${String(
          item.key || item.valueKey || item.type || "item",
        ).trim()}-${index + 1}`,
      };
    })
    .filter((item) => item.visible)
    .sort(
      (a, b) =>
        a.zIndex - b.zIndex ||
        a.y - b.y ||
        a.x - b.x ||
        String(a.key || "").localeCompare(String(b.key || "")),
    );

  if (__DEV__) {
    console.log("[APP_LAYOUT] source", source || "LOCAL");
    console.log("[APP_LAYOUT] raw elements", rawElements.length);
    rawElements.forEach((element) => {
      const campo = String(
        element.Campo ??
          element.campo ??
          element.valueKey ??
          element.key ??
          "Item",
      ).trim();
      const rawAlign = String(
        element.Alineacion ?? element.alineacion ?? element.align ?? "",
      ).trim();
      console.log(
        "[APP_LAYOUT] raw item",
        `Campo ${campo}`,
        `key ${String(element.key ?? "")}`,
        `visible ${Boolean(element.visible)}`,
        `align ${rawAlign || "left"}`,
      );
    });
    mappedElements.forEach((item) => {
      const campo = String(
        item.Campo ?? item.campo ?? item.key ?? "Item",
      ).trim();
      console.log(
        "[APP_LAYOUT] normalized item",
        `Campo ${campo}`,
        `key ${String(item.key ?? "")}`,
        `visible ${Boolean(item.visible)}`,
        `align ${String(item.renderedAlign ?? item.align ?? "left")}`,
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
        `type ${String(item.type ?? "")}`,
        `visible ${Boolean(item.visible)}`,
        `align ${finalAlign}`,
        `italic ${Boolean(item.italic)}`,
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

export const createSampleProduct = () => ({
  descripcion: "Nivea Deo Aerosol B&W Fresh Sin Siliconas X 150 Ml.",
  codigoBarra: "4005900985712",
  codigoInterno: "12345",
  precio: 12500,
  stock: 25,
  fechaActualizacion: new Date().toISOString(),
  companyName: "Nano Distribuciones",
});
