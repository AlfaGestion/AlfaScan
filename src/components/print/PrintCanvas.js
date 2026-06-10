import { useMemo, useState } from "react";
import { LayoutAnimation, StyleSheet, Text, View } from "react-native";

import Colors from "@styles/Colors";
import { Fonts } from "@styles/Theme";
import { buildPrintableLayout } from "@services/printLayoutService";

import PrintElement from "@components/print/PrintElement";

const GRID_STEP = 24;

export default function PrintCanvas({
  format,
  product,
  editable = true,
  selectedElementKey = null,
  onSelectElement,
  onMoveElement,
  onLayoutChange,
  theme,
}) {
  const [availableWidth, setAvailableWidth] = useState(0);

  const layout = useMemo(() => buildPrintableLayout(format, product), [format, product]);
  const fitScale = useMemo(() => {
    if (!availableWidth) {
      return 1;
    }
    return Math.min(1, availableWidth / layout.paperWidthPx);
  }, [availableWidth, layout.paperWidthPx]);
  const displayScale = layout.scale * fitScale;
  const hasVisibleItems = Array.isArray(layout.items) && layout.items.length > 0;

  const handleMove = (key, nextX, nextY) => {
    if (!onMoveElement) {
      return;
    }
    onMoveElement(key, nextX / layout.scale, nextY / layout.scale);
  };

  return (
    <View
      onLayout={(event) => {
        const width = Math.max(0, Math.floor(event.nativeEvent.layout.width));
        setAvailableWidth(width);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        onLayoutChange?.({ width, height: layout.paperHeightPx * fitScale });
      }}
      style={styles.wrap}
    >
      <View
        style={[
          styles.paper,
          {
            width: layout.paperWidthPx * fitScale,
            height: layout.paperHeightPx * fitScale,
            backgroundColor: Colors.WHITE,
            borderColor: theme.border,
          },
        ]}
      >
        {Array.from({ length: Math.ceil(layout.paperHeightPx / GRID_STEP) }).map((_, index) => (
          <View
            key={`grid-h-${index}`}
            pointerEvents="none"
            style={[
              styles.gridLineHorizontal,
              {
                top: index * GRID_STEP * fitScale,
                borderTopColor: "rgba(15,23,32,0.05)",
              },
            ]}
          />
        ))}
        {Array.from({ length: Math.ceil(layout.paperWidthPx / GRID_STEP) }).map((_, index) => (
          <View
            key={`grid-v-${index}`}
            pointerEvents="none"
            style={[
              styles.gridLineVertical,
              {
                left: index * GRID_STEP * fitScale,
                borderLeftColor: "rgba(15,23,32,0.04)",
              },
            ]}
          />
        ))}

        {hasVisibleItems ? (
          layout.items.map((item) => (
            <PrintElement
              key={item.key}
              element={item}
              selected={selectedElementKey === item.key}
              editable={editable}
              displayScale={displayScale}
              onSelect={onSelectElement}
              onMove={handleMove}
            />
          ))
        ) : (
          <View style={styles.emptyState} pointerEvents="none">
            <Text style={[styles.emptyStateText, { color: theme.muted }]}>No hay elementos visibles para este formato.</Text>
          </View>
        )}
      </View>

      <Text style={[styles.hint, { color: theme.muted }]}>
        Tocá un elemento para seleccionarlo y arrastralo para moverlo.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  paper: {
    position: "relative",
    borderWidth: 1,
    borderRadius: 18,
    overflow: "hidden",
    padding: 4,
    marginBottom: 10,
  },
  hint: {
    fontSize: 12,
    fontFamily: Fonts.body,
    textAlign: "center",
  },
  emptyState: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  emptyStateText: {
    fontSize: 14,
    fontFamily: Fonts.body,
    textAlign: "center",
    lineHeight: 20,
  },
  gridLineHorizontal: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 1,
  },
  gridLineVertical: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderLeftWidth: 1,
  },
});
