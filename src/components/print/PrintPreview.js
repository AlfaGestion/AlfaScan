import { View, Text, StyleSheet } from "react-native";

import { Fonts } from "@styles/Theme";
import PrintCanvas from "@components/print/PrintCanvas";

export default function PrintPreview({
  title = "Vista previa",
  format,
  product,
  selectedElementKey,
  onSelectElement,
  onMoveElement,
  editable = true,
  showGrid = true,
  showHint = true,
  theme,
}) {
  return (
    <View>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <PrintCanvas
        format={format}
        product={product}
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
