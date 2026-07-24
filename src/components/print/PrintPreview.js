import { View, Text, StyleSheet } from "react-native";

import { Fonts } from "@styles/Theme";
import PrintCanvas from "@components/print/PrintCanvas";

export default function PrintPreview({
  title = "Vista previa",
  format,
  layout,
  product,
  priceDecimals,
  selectedElementKey,
  onSelectElement,
  onMoveElement,
  editable = true,
  showGrid = false,
  showHint = false,
  theme,
}) {
  return (
    <View>
      {title ? <Text style={[styles.title, { color: theme.text }]}>{title}</Text> : null}
      <PrintCanvas
        format={format}
        layout={layout}
        product={product}
        priceDecimals={priceDecimals}
        editable={editable}
        selectedElementKey={selectedElementKey}
        onSelectElement={onSelectElement}
        onMoveElement={onMoveElement}
        showGrid={showGrid}
        showHint={showHint}
        theme={theme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontFamily: Fonts.display,
    marginBottom: 10,
  },
});
