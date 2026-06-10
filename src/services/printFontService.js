import { Fonts } from "@styles/Theme";

const normalizeFontKey = (value = "") =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, " ");

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
  if (normalized === "codigo de barra") {
    return "codigodebarra";
  }
  return normalized;
};

export const resolvePreviewFontFamily = (value = "") => {
  const normalized = normalizePrintFontName(value);
  if (normalized === "consolas") {
    return "Consolas";
  }
  return FONT_FAMILY_MAP[normalized] || Fonts.body;
};

export const isMonospacePrintFont = (value = "") => {
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
