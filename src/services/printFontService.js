import { Fonts } from "@styles/Theme";

const normalizeFontKey = (value = "") =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isBarcodeFontKey = (value = "") => {
  const normalized = normalizeFontKey(value);
  if (!normalized) {
    return false;
  }

  return (
    normalized === "barcode" ||
    normalized.includes("codigo de barra") ||
    normalized.includes("codigodebarra")
  );
};

const FONT_FAMILY_MAP = {
  default: Fonts.body,
  arial: "Arial",
  roboto: "Roboto",
  "open sans": "Open Sans",
  opensans: "Open Sans",
  montserrat: "Montserrat",
  poppins: "Poppins",
  inter: "Inter",
  helvetica: "Helvetica",
  "times new roman": "Times New Roman",
  timesnewroman: "Times New Roman",
  georgia: "Georgia",
  "courier new": "Courier New",
  couriernew: "Courier New",
  courier: "Courier New",
  consolas: "Consolas",
  monospace: Fonts.mono,
  barcode: Fonts.mono,
  "codigo de barra": Fonts.mono,
  codigodebarra: Fonts.mono,
};

export const normalizePrintFontName = (value = "") => {
  const normalized = normalizeFontKey(value);
  if (!normalized) {
    return "default";
  }
  if (isBarcodeFontKey(normalized)) {
    return "codigodebarra";
  }
  return normalized;
};

export const resolvePreviewFontFamily = (value = "") => {
  if (isBarcodeFontKey(value)) {
    return Fonts.mono;
  }

  const normalized = normalizePrintFontName(value);
  if (!normalized || normalized === "default") {
    return Fonts.body;
  }
  if (normalized === "consolas") {
    return "Consolas";
  }
  return FONT_FAMILY_MAP[normalized] || String(value ?? "").trim() || Fonts.body;
};

export const resolveEffectivePreviewFontFamily = ({
  fontFamily = "",
  tipoFuente = "",
} = {}) => {
  if (isBarcodeFontKey(tipoFuente) || isBarcodeFontKey(fontFamily)) {
    return Fonts.mono;
  }

  const configuredFont = String(fontFamily ?? "").trim();
  if (configuredFont && normalizePrintFontName(configuredFont) !== "default") {
    return configuredFont;
  }

  return resolvePreviewFontFamily(tipoFuente);
};

export const isMonospacePrintFont = (value = "") => {
  if (isBarcodeFontKey(value)) {
    return true;
  }

  const normalized = normalizePrintFontName(value);
  return [
    "monospace",
    "barcode",
    "codigodebarra",
    "courier",
    "courier new",
    "couriernew",
    "consolas",
  ].includes(normalized);
};
