import { memo, useMemo, useRef } from "react";
import { Image, PanResponder, StyleSheet, Text, View } from "react-native";

import { Fonts } from "@styles/Theme";
import { resolvePreviewFontFamily } from "@services/printFontService";

import alfaLogo from "../../../assets/alfa_logo.png";

const hashString = (value) => {
  let hash = 2166136261;
  const source = String(value ?? "");

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const buildBarcodeBars = (value, width) => {
  const source = String(value ?? "4005900985712") || "4005900985712";
  const targetWidth = Math.max(1, Number(width) || 1);
  const idealModuleWidth = 1.1;
  const totalModules = Math.max(
    24,
    Math.min(240, Math.round(targetWidth / idealModuleWidth) || 24),
  );
  const moduleWidth = targetWidth / totalModules;
  const quietZone = Math.max(4, Math.round(totalModules * 0.08));
  const guardModules = 6;
  const dataModules = Math.max(24, totalModules - quietZone * 2 - guardModules);
  const bars = [];
  let seed = hashString(source);

  const nextRandom = () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822519);
    seed ^= seed >>> 13;
    seed = Math.imul(seed, 3266489917);
    return seed >>> 0;
  };

  const pushSegment = (isBar, modules) => {
    if (modules <= 0) {
      return;
    }

    bars.push({
      isBar,
      width: modules * moduleWidth,
    });
  };

  pushSegment(false, quietZone);
  pushSegment(true, 1);
  pushSegment(false, 1);
  pushSegment(true, 1);

  let remaining = dataModules;
  let isBar = false;

  while (remaining > 0) {
    const run = Math.min(remaining, 1 + (nextRandom() % 3));
    pushSegment(isBar, run);
    remaining -= run;
    isBar = !isBar;
  }

  pushSegment(true, 1);
  pushSegment(false, 1);
  pushSegment(true, 1);
  pushSegment(false, quietZone);

  return bars;
};

function PrintElement({
  element,
  selected = false,
  editable = true,
  displayScale = 1,
  onSelect,
  onMove,
}) {
  const startRef = useRef({ x: element.x, y: element.y });
  const scale = displayScale > 0 ? displayScale : 1;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => editable,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          editable &&
          (Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2),
        onPanResponderGrant: () => {
          startRef.current = { x: element.x, y: element.y };
          onSelect?.(element.key);
        },
        onPanResponderMove: (_, gestureState) => {
          if (!editable || !onMove) {
            return;
          }

          const nextX = startRef.current.x + gestureState.dx / scale;
          const nextY = startRef.current.y + gestureState.dy / scale;
          onMove(element.key, nextX, nextY);
        },
        onPanResponderRelease: () => {
          onSelect?.(element.key);
        },
      }),
    [editable, element.key, element.x, element.y, onMove, onSelect, scale],
  );

  const wrapperStyle = [
    styles.wrapper,
    {
      left: element.x * scale,
      top: element.y * scale,
      width: Math.max(24, element.width * scale),
      minHeight: Math.max(24, element.height * scale),
      zIndex: element.zIndex || 1,
    },
    selected && styles.selected,
  ];

  if (element.type === "barcode") {
    const barcodeWidth = Math.max(1, element.width * scale);
    const barcodeHeight = Math.max(1, element.height * scale);
    const barcodeInnerWidth = Math.max(1, barcodeWidth - 2);
    const barcodeInnerHeight = Math.max(1, barcodeHeight - 2);
    const bars = buildBarcodeBars(element.value, barcodeInnerWidth);
    return (
      <View
        style={[
          wrapperStyle,
          styles.barcodeWrapper,
          {
            width: barcodeWidth,
            minHeight: barcodeHeight,
            height: barcodeHeight,
          },
        ]}
        {...(editable ? panResponder.panHandlers : {})}
      >
        <View
          style={[styles.barcodeContainer, { height: barcodeInnerHeight }]}
        >
          <View style={styles.barcodeBarsRow}>
            {bars.map((bar, index) => (
              <View
                key={`${element.key}-bar-${index}`}
                style={[
                  styles.barcodeBar,
                  {
                    width: bar.width,
                    height: barcodeInnerHeight,
                    backgroundColor: "#111827",
                    opacity: bar.isBar ? 1 : 0,
                  },
                ]}
              />
            ))}
          </View>
        </View>
        {selected ? (
          <Text style={styles.selectionLabel}>{element.label}</Text>
        ) : null}
      </View>
    );
  }

  if (element.type === "logo") {
    return (
      <View
        style={wrapperStyle}
        {...(editable ? panResponder.panHandlers : {})}
      >
        <View style={styles.logoWrap}>
          <Image
            source={alfaLogo}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text
            style={[
              styles.logoText,
              {
                fontSize: Math.max(10, element.fontSize * 0.85),
                textAlign: element.align || "center",
                color: element.color || "#111827",
                fontFamily: resolvePreviewFontFamily(
                  element.tipoFuente || element.fontFamily || "Default",
                ),
              },
            ]}
            numberOfLines={1}
          >
            {element.value || "Alfa"}
          </Text>
        </View>
        {selected ? (
          <Text style={styles.selectionLabel}>{element.label}</Text>
        ) : null}
      </View>
    );
  }

  if (element.type === "separator") {
    const thickness = Math.max(
      2,
      Math.round(Number(element.separatorThickness ?? 2) || 2),
    );
    return (
      <View
        style={[
          wrapperStyle,
          styles.separatorWrapper,
          {
            height: Math.max(12, thickness + 10),
            minHeight: Math.max(12, thickness + 10),
            backgroundColor: "transparent",
          },
        ]}
        {...(editable ? panResponder.panHandlers : {})}
      >
        <View
          style={[
            styles.separatorLine,
            {
              height: thickness,
              minHeight: thickness,
              backgroundColor: element.color || "#111827",
            },
          ]}
        />
        {selected ? (
          <Text style={styles.selectionLabel}>
            {element.label || "Separador"}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={wrapperStyle} {...(editable ? panResponder.panHandlers : {})}>
      <Text
        style={[
          styles.text,
          {
            color: element.color || "#111827",
            fontSize: Math.max(10, element.fontSize),
            fontWeight: element.fontWeight === "700" ? "700" : "400",
            fontStyle:
              element.fontStyle || (element.italic ? "italic" : "normal"),
            fontFamily: resolvePreviewFontFamily(
              element.tipoFuente || element.fontFamily || "Default",
            ),
            textAlign: element.align || "left",
            textTransform: element.uppercase ? "uppercase" : "none",
            lineHeight: Math.max(12, element.fontSize * 1.18),
          },
        ]}
        numberOfLines={Math.max(1, element.maxLines || 1)}
      >
        {element.value || element.sampleText || ""}
      </Text>
      {selected ? (
        <Text style={styles.selectionLabel}>{element.label}</Text>
      ) : null}
    </View>
  );
}

export default memo(PrintElement);

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    padding: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderWidth: 1,
    borderColor: "transparent",
    justifyContent: "center",
  },
  selected: {
    borderColor: "#1E88E5",
    backgroundColor: "rgba(30,136,229,0.08)",
  },
  text: {
    fontFamily: Fonts.display,
    color: "#111827",
  },
  selectionLabel: {
    marginTop: 2,
    fontSize: 10,
    fontFamily: Fonts.body,
    color: "#1E88E5",
    textAlign: "center",
  },
  barcodeContainer: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  barcodeBarsRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    gap: 0,
    minHeight: 0,
  },
  barcodeBar: {
    borderRadius: 0,
  },
  barcodeWrapper: {
    padding: 0,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 6,
    justifyContent: "flex-start",
    alignItems: "flex-start",
  },
  logoWrap: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  logoImage: {
    width: 36,
    height: 36,
  },
  logoText: {
    marginTop: 2,
    fontFamily: Fonts.display,
  },
  separatorLine: {
    width: "100%",
    borderRadius: 999,
  },
  separatorWrapper: {
    paddingVertical: 2,
    paddingHorizontal: 0,
    justifyContent: "center",
    alignItems: "stretch",
  },
});
