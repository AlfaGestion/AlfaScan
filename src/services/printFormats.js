import Configuration from "@db/Configuration";

export const PRINT_FORMAT_KEYS = ["gondola", "product", "small", "custom"];

export const DEFAULT_PRINT_FORMATS = [
  {
    key: "gondola",
    name: "Góndola",
    paperWidth: "80",
    descriptionFontSize: "22",
    priceFontSize: "34",
    showDescription: true,
    showPrice: true,
    showBarcode: true,
    showStock: false,
    showDate: true,
    showCompanyName: false,
    showInternalCode: false,
    copies: "1",
    marginTop: "0",
    marginBottom: "0",
    alignment: "center",
    boldPrice: true,
    previewBeforePrint: true,
  },
  {
    key: "product",
    name: "Producto",
    paperWidth: "80",
    descriptionFontSize: "16",
    priceFontSize: "24",
    showDescription: true,
    showPrice: true,
    showBarcode: true,
    showStock: false,
    showDate: false,
    showCompanyName: false,
    showInternalCode: false,
    copies: "1",
    marginTop: "0",
    marginBottom: "0",
    alignment: "center",
    boldPrice: true,
    previewBeforePrint: true,
  },
  {
    key: "small",
    name: "Precio Chico",
    paperWidth: "58",
    descriptionFontSize: "12",
    priceFontSize: "20",
    showDescription: true,
    showPrice: true,
    showBarcode: true,
    showStock: false,
    showDate: false,
    showCompanyName: false,
    showInternalCode: false,
    copies: "1",
    marginTop: "0",
    marginBottom: "0",
    alignment: "center",
    boldPrice: true,
    previewBeforePrint: true,
  },
  {
    key: "custom",
    name: "Personalizado",
    paperWidth: "80",
    descriptionFontSize: "16",
    priceFontSize: "24",
    showDescription: true,
    showPrice: true,
    showBarcode: true,
    showStock: true,
    showDate: true,
    showCompanyName: true,
    showInternalCode: true,
    copies: "1",
    marginTop: "0",
    marginBottom: "0",
    alignment: "center",
    boldPrice: true,
    previewBeforePrint: true,
  },
];

export const normalizePrintFormats = (value) => {
  if (!value) {
    return DEFAULT_PRINT_FORMATS;
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_PRINT_FORMATS;
    }

    return DEFAULT_PRINT_FORMATS.map((fallback, index) => ({
      ...fallback,
      ...(parsed[index] || {}),
      key: fallback.key,
      name: String(parsed[index]?.name ?? fallback.name),
    }));
  } catch (e) {
    return DEFAULT_PRINT_FORMATS;
  }
};

export const loadPrintFormats = async () => {
  await Configuration.createTable();
  const raw = await Configuration.getConfigValue("PRINT_FORMATS_JSON");
  return normalizePrintFormats(raw);
};

export const savePrintFormats = async (formats) => {
  await Configuration.createTable();
  await Configuration.setConfigValue("PRINT_FORMATS_JSON", JSON.stringify(formats));
};
