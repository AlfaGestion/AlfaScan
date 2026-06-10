import { memo, useMemo, useRef } from "react";
import { Image, PanResponder, StyleSheet, Text, View } from "react-native";

import Colors from "@styles/Colors";
import { Fonts } from "@styles/Theme";

import alfaLogo from "../../../assets/alfa_logo.png";

const buildBarcodeBars = (value) => {
  const source = String(value ?? "4005900985712") || "4005900985712";
  return Array.from(source).flatMap((char, index) => {
    const code = char.charCodeAt(0);
    const bars = [
      ((code + index) % 3) + 1,
      ((code + index * 2) % 4) + 1,
      ((code + index * 3) % 3) + 1,
    ];
    return bars;
  });
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
          editable && (Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2),
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
    const bars = buildBarcodeBars(element.value);
    return (
      <View style={wrapperStyle} {...(editable ? panResponder.panHandlers : {})}>
        <View style={styles.barcodeContainer}>
          <View style={styles.barcodeBarsRow}>
            {bars.map((bar, index) => (
              <View
                key={`${element.key}-bar-${index}`}
                style={[
                  styles.barcodeBar,
                  {
                    width: bar * 1.4,
                    height: index % 4 === 0 ? 34 : index % 3 === 0 ? 28 : 22,
                    backgroundColor: "#111827",
                  },
                ]}
              />
            ))}
          </View>
          {element.showNumber !== false ? (
            <Text
              style={[
                styles.barcodeText,
                {
                  fontSize: Math.max(10, element.fontSize * 0.9),
                  textAlign: element.align || "center",
                  color: element.color || "#111827",
                },
              ]}
              numberOfLines={1}
            >
              {element.value}
            </Text>
          ) : null}
        </View>
        {selected ? <Text style={styles.selectionLabel}>{element.label}</Text> : null}
      </View>
    );
  }

  if (element.type === "logo") {
    return (
      <View style={wrapperStyle} {...(editable ? panResponder.panHandlers : {})}>
        <View style={styles.logoWrap}>
          <Image source={alfaLogo} style={styles.logoImage} resizeMode="contain" />
          <Text
            style={[
              styles.logoText,
              {
                fontSize: Math.max(10, element.fontSize * 0.85),
                textAlign: element.align || "center",
                color: element.color || "#111827",
              },
            ]}
            numberOfLines={1}
          >
            {element.value || "Alfa"}
          </Text>
        </View>
        {selected ? <Text style={styles.selectionLabel}>{element.label}</Text> : null}
      </View>
    );
  }

  if (element.type === "separator") {
    const thickness = Math.max(2, Math.round(Number(element.separatorThickness ?? 2) || 2));
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
        {selected ? <Text style={styles.selectionLabel}>{element.label || "Separador"}</Text> : null}
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
            fontStyle: element.italic ? "italic" : "normal",
            textAlign: element.align || "left",
            textTransform: element.uppercase ? "uppercase" : "none",
            lineHeight: Math.max(12, element.fontSize * 1.18),
          },
        ]}
        numberOfLines={Math.max(1, element.maxLines || 1)}
      >
        {element.value || element.sampleText || ""}
      </Text>
      {selected ? <Text style={styles.selectionLabel}>{element.label}</Text> : null}
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
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  barcodeBarsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 1,
  },
  barcodeBar: {
    borderRadius: 1,
  },
  barcodeText: {
    marginTop: 4,
    fontFamily: Fonts.mono,
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
