package com.alfagestion.alfascan.sunmi;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.sunmi.v2.printer.SunmiV2PrinterModule;

import java.util.Map;

public class SunmiPrinterModule extends SunmiV2PrinterModule {
  public SunmiPrinterModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "SunmiPrinterModule";
  }

  @ReactMethod
  public void initPrinter(Promise promise) {
    super.printerInit(promise);
  }

  @ReactMethod
  public void getPrinterStatus(Promise promise) {
    promise.resolve(buildPrinterInfoMap());
  }

  @ReactMethod
  public void getPrinterInfo(Promise promise) {
    promise.resolve(buildPrinterInfoMap());
  }

  @ReactMethod
  public void printText(String text, Promise promise) {
    super.printString(text, promise);
  }

  @ReactMethod
  public void printBarcode(String code, Promise promise) {
    super.printBarCode(code, 2, 162, 2, 2, promise);
  }

  @ReactMethod
  public void printQrCode(String text, Promise promise) {
    super.printQRCode(text, 4, 2, promise);
  }

  @ReactMethod
  public void printTestPage(Promise promise) {
    super.printString(
      "AlfaScan\nPrueba de impresora\n\nFecha/Hora\n\n1234567890123\n",
      promise
    );
  }

  private WritableMap buildPrinterInfoMap() {
    Map<String, Object> constants = super.getConstants();
    WritableMap map = Arguments.createMap();

    map.putBoolean("hasPrinter", toBoolean(constants.get("hasPrinter")));
    map.putBoolean("available", toBoolean(constants.get("hasPrinter")));
    map.putString("printerVersion", toStringValue(constants.get("printerVersion")));
    map.putString("printerModal", toStringValue(constants.get("printerModal")));
    map.putString("printerSerialNo", toStringValue(constants.get("printerSerialNo")));
    map.putString("mode", toBoolean(constants.get("hasPrinter")) ? "NATIVE" : "UNAVAILABLE");

    Object inner = constants.get("Constants");
    if (inner instanceof Map) {
      @SuppressWarnings("unchecked")
      Map<String, Object> actions = (Map<String, Object>) inner;
      WritableMap actionsMap = Arguments.createMap();
      for (Map.Entry<String, Object> entry : actions.entrySet()) {
        actionsMap.putString(entry.getKey(), toStringValue(entry.getValue()));
      }
      map.putMap("constants", actionsMap);
    }

    return map;
  }

  private static boolean toBoolean(Object value) {
    return value instanceof Boolean ? (Boolean) value : Boolean.parseBoolean(String.valueOf(value));
  }

  private static String toStringValue(Object value) {
    return value == null ? "" : String.valueOf(value);
  }
}
