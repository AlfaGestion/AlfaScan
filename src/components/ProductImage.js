import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";

import Configuration from "@db/Configuration";
import { useThemeConfig } from "@context/ThemeContext";

import imgProduct from "@icons/articulos.png";
import imgProductDark from "@icons/articulos_b.png";

const DEFAULT_EXTENSIONS = ["jpg", "jpeg", "png"];

const normalizeExtensions = (value) => {
  const list = String(value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(list.length > 0 ? list : DEFAULT_EXTENSIONS)];
  return unique;
};

const normalizeExtension = (value) => {
  const cleaned = String(value ?? "").trim().toLowerCase();
  return cleaned || "jpg";
};

const normalizeBasePath = (value) => {
  const base = String(value ?? "").trim();
  if (!base) {
    return "";
  }

  if (/^[A-Za-z]:[\\/]/.test(base)) {
    return "";
  }

  return base.replace(/\\/g, "/");
};

const joinPath = (base, fileName) => {
  const cleanBase = String(base ?? "").trim().replace(/\/+$/g, "");
  const cleanFile = String(fileName ?? "").trim().replace(/^\/+/g, "");
  if (!cleanBase) {
    return cleanFile;
  }

  if (/^(https?:\/\/|file:\/\/|content:\/\/)/i.test(cleanBase)) {
    return `${cleanBase}/${cleanFile}`;
  }

  if (cleanBase.startsWith("/")) {
    return `file://${cleanBase}/${cleanFile}`;
  }

  return "";
};

const buildLegacyRemoteBase = async (fileName) => {
  const accountRows = await Configuration.getConfig("ALFA_ACCOUNT");
  const account = String(accountRows?.[0]?.value ?? "").trim();
  if (!account) {
    return "";
  }

  return `https://alfanet.com.ar/ac/public/assets/images/${account}/${fileName}`;
};

export default function ProductImage({
  fileName,
  reload = false,
  widthImage = 200,
  heightImage = 200,
  cancelaCarga = false,
  containerStyle,
}) {
  const { darkMode } = useThemeConfig();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attemptIndex, setAttemptIndex] = useState(0);
  const [candidates, setCandidates] = useState([]);

  const placeholderSource = darkMode ? imgProductDark : imgProduct;

  const loadConfiguration = useCallback(async () => {
    if (cancelaCarga || !String(fileName ?? "").trim()) {
      setCandidates([]);
      setAttemptIndex(0);
      setFailed(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setFailed(false);
    setAttemptIndex(0);
    setCandidates([]);

    let hasCandidates = false;
    try {
      await Configuration.createTable();
      const useProductImage = Configuration.isTruthyConfigValue(
        (await Configuration.getConfigValue("USE_PRODUCT_IMAGE")) ||
          (await Configuration.getConfigValue("CARGA_IMAGENES")),
      );

      if (!useProductImage) {
        setFailed(true);
        setLoading(false);
        return;
      }

      const basePath = normalizeBasePath(
        (await Configuration.getConfigValue("PRODUCT_IMAGE_BASE_PATH")) ||
          (await Configuration.getConfigValue("PRODUCT_IMAGE_PATH")),
      );
      const defaultExtension = normalizeExtension(
        await Configuration.getConfigValue("PRODUCT_IMAGE_DEFAULT_EXTENSION"),
      );
      const allowedExtensions = normalizeExtensions(
        await Configuration.getConfigValue("PRODUCT_IMAGE_ALLOWED_EXTENSIONS"),
      );
      const normalizedFileName = String(fileName ?? "").trim();

      const fileCandidates = [];
      const uniqueExtensions = [
        defaultExtension,
        ...allowedExtensions.filter((item) => item !== defaultExtension),
      ];

      if (basePath) {
        for (const extension of uniqueExtensions) {
          const candidate = joinPath(
            basePath,
            `${normalizedFileName}.${extension}`,
          );
          if (candidate) {
            fileCandidates.push(candidate);
          }
        }
      } else {
        const legacyBase = await buildLegacyRemoteBase(normalizedFileName);
        if (legacyBase) {
          fileCandidates.push(`${legacyBase}.${defaultExtension}`);
        }
      }

      if (fileCandidates.length === 0) {
        setFailed(true);
        setLoading(false);
        return;
      }

      hasCandidates = true;
      setCandidates(fileCandidates);
    } catch (e) {
      setCandidates([]);
      setFailed(true);
    } finally {
      if (!hasCandidates) {
        setLoading(false);
      }
    }
  }, [cancelaCarga, fileName]);

  useEffect(() => {
    loadConfiguration();
  }, [loadConfiguration, reload]);

  const activeSource = useMemo(() => candidates[attemptIndex] || "", [attemptIndex, candidates]);

  const handleImageError = useCallback(() => {
    setAttemptIndex((current) => {
      const next = current + 1;
      if (next < candidates.length) {
        return next;
      }

      setFailed(true);
      return current;
    });
  }, [candidates.length]);

  const showPlaceholder = failed || !activeSource;

  return (
    <View style={[styles.container, containerStyle]}>
      {loading && candidates.length === 0 && !failed ? (
        <ActivityIndicator size="small" color="#1E88E5" />
      ) : showPlaceholder ? (
        <Image
          source={placeholderSource}
          style={{ width: widthImage, height: heightImage, borderRadius: 10 }}
          resizeMode="contain"
        />
      ) : (
        <Image
          source={{ uri: activeSource }}
          onError={handleImageError}
          onLoadEnd={() => setLoading(false)}
          style={{ width: widthImage, height: heightImage, borderRadius: 10 }}
          resizeMode="contain"
        />
      )}
      {loading && activeSource && !failed ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#1E88E5" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.35)",
  },
});
