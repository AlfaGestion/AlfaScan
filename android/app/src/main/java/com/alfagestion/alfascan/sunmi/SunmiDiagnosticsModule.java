package com.alfagestion.alfascan.sunmi;

import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;

import java.util.List;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import woyou.aidlservice.jiuiv5.ICallback;
import woyou.aidlservice.jiuiv5.IWoyouService;

public class SunmiDiagnosticsModule extends ReactContextBaseJavaModule {
  private static final String TAG = "SunmiDiagnostics";
  private static final String MODULE_NAME = "SunmiDiagnostics";
  private static final String SUNMI_PACKAGE = "woyou.aidlservice.jiuiv5";
  private static final String SUNMI_ACTION = "woyou.aidlservice.jiuiv5.IWoyouService";
  private static final boolean PRINT_BARCODE_AS_TEXT = false;

  private static final String OUT_OF_PAPER_ACTION = "woyou.aidlservice.jiuv5.OUT_OF_PAPER_ACTION";
  private static final String ERROR_ACTION = "woyou.aidlservice.jiuv5.ERROR_ACTION";
  private static final String NORMAL_ACTION = "woyou.aidlservice.jiuv5.NORMAL_ACTION";
  private static final String COVER_OPEN_ACTION = "woyou.aidlservice.jiuv5.COVER_OPEN_ACTION";
  private static final String COVER_ERROR_ACTION = "woyou.aidlservice.jiuv5.COVER_ERROR_ACTION";
  private static final String KNIFE_ERROR_1_ACTION = "woyou.aidlservice.jiuv5.KNIFE_ERROR_ACTION_1";
  private static final String KNIFE_ERROR_2_ACTION = "woyou.aidlservice.jiuv5.KNIFE_ERROR_ACTION_2";
  private static final String OVER_HEATING_ACTION = "woyou.aidlservice.jiuv5.OVER_HEATING_ACITON";
  private static final String FIRMWARE_UPDATING_ACTION = "woyou.aidlservice.jiuv5.FIRMWARE_UPDATING_ACITON";

  private final Object stateLock = new Object();
  private final ReactApplicationContext reactContext;

  private volatile IWoyouService printerService;
  private volatile boolean bound = false;
  private volatile boolean binding = false;
  private volatile boolean innerPrinterAvailable = false;
  private volatile boolean paperPresent = false;
  private volatile String lastError = "";
  private volatile String lastAction = "";
  private volatile String printerVersion = "";
  private volatile String printerModal = "";
  private volatile String printerSerialNo = "";
  private volatile String serviceVersion = "";

  private final BroadcastReceiver printerReceiver = new BroadcastReceiver() {
    @Override
    public void onReceive(Context context, Intent intent) {
      String action = intent != null ? intent.getAction() : "";
      if (action == null) {
        action = "";
      }

      lastAction = action;
      if (OUT_OF_PAPER_ACTION.equals(action)) {
        paperPresent = false;
        lastError = "Sin papel.";
      } else if (NORMAL_ACTION.equals(action)) {
        paperPresent = true;
        lastError = "";
      } else if (COVER_OPEN_ACTION.equals(action)) {
        lastError = "Cubierta abierta.";
      } else if (COVER_ERROR_ACTION.equals(action)) {
        lastError = "Error de cubierta.";
      } else if (KNIFE_ERROR_1_ACTION.equals(action) || KNIFE_ERROR_2_ACTION.equals(action)) {
        lastError = "Error de corte.";
      } else if (ERROR_ACTION.equals(action)) {
        if (lastError.isEmpty()) {
          lastError = "Error de impresora.";
        }
      } else if (OVER_HEATING_ACTION.equals(action)) {
        lastError = "Sobrecalentamiento.";
      } else if (FIRMWARE_UPDATING_ACTION.equals(action)) {
        lastError = "Actualizando firmware.";
      }
    }
  };

  private final ServiceConnection serviceConnection = new ServiceConnection() {
    @Override
    public void onServiceConnected(ComponentName name, IBinder service) {
      synchronized (stateLock) {
        printerService = IWoyouService.Stub.asInterface(service);
        bound = printerService != null;
        binding = false;
      }
      refreshPrinterMetadata();
    }

    @Override
    public void onServiceDisconnected(ComponentName name) {
      synchronized (stateLock) {
        printerService = null;
        bound = false;
      }
      lastError = "Servicio desconectado.";
    }
  };

  public SunmiDiagnosticsModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;

    IntentFilter filter = new IntentFilter();
    filter.addAction(OUT_OF_PAPER_ACTION);
    filter.addAction(ERROR_ACTION);
    filter.addAction(NORMAL_ACTION);
    filter.addAction(COVER_OPEN_ACTION);
    filter.addAction(COVER_ERROR_ACTION);
    filter.addAction(KNIFE_ERROR_1_ACTION);
    filter.addAction(KNIFE_ERROR_2_ACTION);
    filter.addAction(OVER_HEATING_ACTION);
    filter.addAction(FIRMWARE_UPDATING_ACTION);
    reactContext.registerReceiver(printerReceiver, filter);
  }

  @Override
  public String getName() {
    return MODULE_NAME;
  }

  @Override
  public void onCatalystInstanceDestroy() {
    super.onCatalystInstanceDestroy();
    try {
      reactContext.unregisterReceiver(printerReceiver);
    } catch (Exception ignored) {
      // ignore
    }
    unbindServiceInternal();
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  public boolean isSunmiDevice() {
    WritableMap info = buildDeviceInfo();
    String joined = (
      info.getString("manufacturer") + " " +
      info.getString("brand") + " " +
      info.getString("model") + " " +
      info.getString("device") + " " +
      info.getString("product")
    ).toLowerCase(Locale.ROOT);
    return joined.contains("sunmi");
  }

  @ReactMethod
  public void getDeviceInfo(Promise promise) {
    promise.resolve(buildDeviceInfo());
  }

  @ReactMethod
  public void isInnerPrinterAvailable(Promise promise) {
    promise.resolve(Boolean.valueOf(isInnerPrinterAvailableInternal()));
  }

  @ReactMethod
  public void bindPrinterService(Promise promise) {
    bindPrinterServiceInternal(promise, false);
  }

  @ReactMethod
  public void getPrinterStatus(Promise promise) {
    WritableMap map = buildStatusMap();
    promise.resolve(map);
  }

  @ReactMethod
  public void printTestPage(Promise promise) {
    bindPrinterServiceInternal(promise, true);
  }

  @ReactMethod
  public void printSimpleProductLabel(ReadableMap payload, Promise promise) {
    if (printerService == null || !bound) {
      promise.reject("SERVICE_NOT_CONNECTED", "Servicio no conectado.");
      return;
    }

    try {
      String formatKey = getStringSafe(payload, "formatKey");
      String description = getStringSafe(payload, "description");
      String price = getStringSafe(payload, "price");
      String barcode = getStringSafe(payload, "barcode");
      String internalCode = getStringSafe(payload, "internalCode");
      String companyName = getStringSafe(payload, "companyName");
      int copies = Math.max(1, getIntSafe(payload, "copies", 1));
      ReadableArray items = payload.hasKey("items") && !payload.isNull("items") ? payload.getArray("items") : null;
      if (items != null && items.size() > 0) {
        printLayoutItemsInternal(printerService, items, copies);
      } else {
        throw new Exception("El layout de impresión no contiene items.");
      }
      promise.resolve(Boolean.TRUE);
    } catch (Exception e) {
      lastError = e.getMessage();
      promise.reject("PRINT_ERROR", e.getMessage(), e);
    }
  }

  @ReactMethod
  public void printAlfaScanSmokeTest(Promise promise) {
    if (printerService == null || !bound) {
      promise.reject("SERVICE_NOT_CONNECTED", "Servicio no conectado.");
      return;
    }

    try {
      Log.i(TAG, "[SUNMI] printAlfaScanSmokeTest start");
      callPrinterCommand(callback -> printerService.printerInit(callback));

      Log.i(TAG, "[SUNMI] smoke title");
      callPrinterCommand(callback -> printerService.setAlignment(1, callback));
      callPrinterCommand(callback -> printerService.printText("AlfaScan Smoke Test\n\n", callback));
      callPrinterCommand(callback -> printerService.lineWrap(1, callback));

      Log.i(TAG, "[SUNMI] smoke description");
      callPrinterCommand(callback -> printerService.setAlignment(0, callback));
      callPrinterCommand(callback -> printerService.printText("Prueba de impresion\n\n", callback));
      callPrinterCommand(callback -> printerService.lineWrap(1, callback));

      Log.i(TAG, "[SUNMI] smoke price");
      callPrinterCommand(callback -> printerService.setAlignment(1, callback));
      callPrinterCommand(callback -> printerService.printText("$ 0,00\n\n", callback));
      callPrinterCommand(callback -> printerService.lineWrap(1, callback));

      Log.i(TAG, "[SUNMI] smoke code");
      callPrinterCommand(callback -> printerService.setAlignment(0, callback));
      callPrinterCommand(callback -> printerService.printText("Cod: SMOKE\n\n", callback));
      callPrinterCommand(callback -> printerService.lineWrap(2, callback));
      Log.i(TAG, "[SUNMI] printAlfaScanSmokeTest done");

      promise.resolve(Boolean.TRUE);
    } catch (Exception e) {
      lastError = e.getMessage();
      Log.e(TAG, "[SUNMI] printAlfaScanSmokeTest error", e);
      promise.reject("SUNMI_SMOKE_ERROR", e.getMessage(), e);
    }
  }

  @ReactMethod
  public void printPlainTextTest(Promise promise) {
    if (printerService == null || !bound) {
      promise.reject("SERVICE_NOT_CONNECTED", "Servicio no conectado.");
      return;
    }

    try {
      Log.i(TAG, "[SUNMI] printPlainTextTest start");
      callPrinterCommand(callback -> printerService.printerInit(callback));
      callPrinterCommand(callback -> printerService.setAlignment(0, callback));
      String text = "ALFASCAN TEST\n123456789\n";
      Log.i(TAG, "[SUNMI] printPlainTextTest length=" + text.length());
      Log.i(TAG, "[SUNMI] using printOriginalText");
      callPrinterCommand(callback -> printerService.printOriginalText(text, callback));
      callPrinterCommand(callback -> printerService.lineWrap(3, callback));
      Log.i(TAG, "[SUNMI] printPlainTextTest done");
      promise.resolve(Boolean.TRUE);
    } catch (Exception e) {
      lastError = e.getMessage();
      Log.e(TAG, "[SUNMI] printPlainTextTest error", e);
      promise.reject("SUNMI_PLAIN_TEXT_ERROR", e.getMessage(), e);
    }
  }

  @ReactMethod
  public void printFontScaleTest(Promise promise) {
    if (printerService == null || !bound) {
      promise.reject("SERVICE_NOT_CONNECTED", "Servicio no conectado.");
      return;
    }

    try {
      Log.i(TAG, "[SUNMI_SCALE_TEST] build db88bf8 active");
      Log.i(TAG, "[SUNMI_SCALE_TEST] start");
      callPrinterCommand(callback -> printerService.printerInit(callback));
      callPrinterCommand(callback -> printerService.setAlignment(0, callback));

      float[] sizes = new float[] {18f, 24f, 32f, 40f, 48f};
      String[] lines = new String[] {"FONT 18", "FONT 24", "FONT 32", "FONT 40", "FONT 48"};

      for (int i = 0; i < sizes.length; i++) {
        float size = sizes[i];
        String line = lines[i];
        Log.i(TAG, "[SUNMI_SCALE_TEST] size=" + size + " text=" + line);
        callPrinterCommand(callback -> printerService.setFontSize(size, callback));
        callPrinterCommand(callback -> printerService.printText(line + "\n", callback));
        if (i < sizes.length - 1) {
          callPrinterCommand(callback -> printerService.lineWrap(1, callback));
        }
      }

      callPrinterCommand(callback -> printerService.lineWrap(2, callback));
      Log.i(TAG, "[SUNMI_SCALE_TEST] done");
      promise.resolve(Boolean.TRUE);
    } catch (Exception e) {
      lastError = e.getMessage();
      Log.e(TAG, "[SUNMI_SCALE_TEST] error", e);
      promise.reject("SUNMI_SCALE_TEST_ERROR", e.getMessage(), e);
    }
  }
  private WritableMap buildDeviceInfo() {
    WritableMap map = Arguments.createMap();
    map.putString("manufacturer", String.valueOf(Build.MANUFACTURER));
    map.putString("brand", String.valueOf(Build.BRAND));
    map.putString("model", String.valueOf(Build.MODEL));
    map.putString("device", String.valueOf(Build.DEVICE));
    map.putString("product", String.valueOf(Build.PRODUCT));
    map.putString("androidVersion", String.valueOf(Build.VERSION.RELEASE));
    map.putString("packageName", reactContext.getPackageName());
    return map;
  }

  private boolean isSunmiDeviceFromBuild() {
    String joined = (
      String.valueOf(Build.MANUFACTURER) + " " +
      String.valueOf(Build.BRAND) + " " +
      String.valueOf(Build.MODEL) + " " +
      String.valueOf(Build.DEVICE) + " " +
      String.valueOf(Build.PRODUCT)
    ).toLowerCase(Locale.ROOT);
    return joined.contains("sunmi");
  }

  private boolean isInnerPrinterAvailableInternal() {
    if (!isSunmiDeviceFromBuild()) {
      innerPrinterAvailable = false;
      return false;
    }

    Intent intent = createPrinterIntent();
    PackageManager packageManager = reactContext.getPackageManager();
    List<ResolveInfo> services = packageManager.queryIntentServices(intent, 0);
    innerPrinterAvailable = services != null && !services.isEmpty();
    return innerPrinterAvailable;
  }

  private Intent createPrinterIntent() {
    Intent intent = new Intent();
    intent.setPackage(SUNMI_PACKAGE);
    intent.setAction(SUNMI_ACTION);
    return intent;
  }

  private void bindPrinterServiceInternal(final Promise promise, final boolean validateReady) {
    if (!isInnerPrinterAvailableInternal()) {
      lastError = "Servicio no encontrado.";
      promise.reject("SERVICE_NOT_FOUND", "Servicio no encontrado");
      return;
    }

    synchronized (stateLock) {
      if (bound && printerService != null) {
        if (validateReady) {
          try {
            printTestPageInternal(printerService);
          } catch (Exception e) {
            promise.reject("PRINT_ERROR", e.getMessage(), e);
            return;
          }
        }
        promise.resolve(buildStatusMap());
        return;
      }

      if (binding) {
        promise.reject("BIND_IN_PROGRESS", "El bind al servicio ya está en progreso.");
        return;
      }
      binding = true;
    }

    final CountDownLatch latch = new CountDownLatch(1);
    final AtomicReference<String> bindError = new AtomicReference<>("");
    final Intent intent = createPrinterIntent();

    boolean started = false;
    try {
      reactContext.startService(intent);
      started = true;
    } catch (Exception e) {
      Log.i(TAG, "startService failed: " + e.getMessage());
    }

    boolean boundOk = reactContext.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE);
    if (!boundOk) {
      synchronized (stateLock) {
        binding = false;
      }
      lastError = "Error de bind.";
      promise.reject("BIND_FAILED", "Error de bind.");
      return;
    }

    new Thread(() -> {
      try {
        for (int i = 0; i < 60; i++) {
          if (printerService != null) {
            latch.countDown();
            break;
          }
          Thread.sleep(100);
        }

        if (printerService == null) {
          bindError.set("Error de bind: timeout");
        } else {
          refreshPrinterMetadata();
        }

        if (bindError.get().isEmpty()) {
          if (validateReady) {
            printTestPageInternal(printerService);
          }
          promise.resolve(buildStatusMap());
        } else {
          lastError = bindError.get();
          promise.reject("BIND_TIMEOUT", bindError.get());
        }
      } catch (Exception e) {
        lastError = e.getMessage();
        promise.reject("BIND_FAILED", e.getMessage(), e);
      } finally {
        synchronized (stateLock) {
          binding = false;
        }
      }
    }).start();
  }

  private void unbindServiceInternal() {
    synchronized (stateLock) {
      if (bound || binding) {
        try {
          reactContext.unbindService(serviceConnection);
        } catch (Exception ignored) {
          // ignore
        }
      }
      bound = false;
      binding = false;
      printerService = null;
    }
  }

  private void refreshPrinterMetadata() {
    IWoyouService service = printerService;
    if (service == null) {
      return;
    }

    try {
      serviceVersion = String.valueOf(service.getServiceVersion());
    } catch (Exception e) {
      serviceVersion = "";
    }

    try {
      printerVersion = String.valueOf(service.getPrinterVersion());
    } catch (Exception e) {
      printerVersion = "";
    }

    try {
      printerModal = String.valueOf(service.getPrinterModal());
    } catch (Exception e) {
      printerModal = "";
    }

    try {
      printerSerialNo = String.valueOf(service.getPrinterSerialNo());
    } catch (Exception e) {
      printerSerialNo = "";
    }
  }

  private WritableMap buildStatusMap() {
    WritableMap map = Arguments.createMap();
    map.putMap("device", buildDeviceInfo());
    map.putBoolean("isSunmiDevice", isSunmiDeviceFromBuild());
    map.putBoolean("innerPrinterAvailable", innerPrinterAvailable);
    map.putBoolean("bound", bound && printerService != null);
    map.putBoolean("binding", binding);
    map.putBoolean("paperPresent", paperPresent || (bound && printerService != null && !lastError.toLowerCase(Locale.ROOT).contains("papel")));
    map.putString("lastAction", lastAction);
    map.putString("lastError", lastError);
    map.putString("serviceVersion", serviceVersion);
    map.putString("printerVersion", printerVersion);
    map.putString("printerModal", printerModal);
    map.putString("printerSerialNo", printerSerialNo);
    map.putString("packageName", reactContext.getPackageName());
    return map;
  }

  private void printTestPageInternal(IWoyouService service) throws Exception {
    callPrinterCommand(callback -> service.printerInit(callback));

    callPrinterCommand(callback -> service.setAlignment(1, callback));
    callPrinterCommand(callback -> service.setFontSize(18f, callback));

    String[] lines = new String[] {
      "AlfaScan",
      "Prueba de impresion",
      String.valueOf(System.currentTimeMillis()),
      "1234567890123",
      "-------------"
    };

    for (int i = 0; i < lines.length; i++) {
      String line = lines[i];
      callPrinterCommand(callback -> service.printText(line, callback));
      if (i < lines.length - 1) {
        callPrinterCommand(callback -> service.lineWrap(1, callback));
      }
    }

    callPrinterCommand(callback -> service.lineWrap(2, callback));
  }

  private void printLayoutItemsInternal(IWoyouService service, ReadableArray items, int copies) throws Exception {
    int totalCopies = Math.max(1, copies);
    Log.i(TAG, "[SUNMI_LAYOUT] received items " + items.size());
    callPrinterCommand(callback -> service.printerInit(callback));

    for (int copy = 0; copy < totalCopies; copy++) {
      if (copy > 0) {
        callPrinterCommand(callback -> service.lineWrap(2, callback));
      }

      int lastBottom = 0;
      for (int i = 0; i < items.size(); i++) {
        ReadableMap item = items.getMap(i);
        if (item == null) {
          continue;
        }

        int targetTop = getIntSafe(item, "y", 0);
        int itemHeight = Math.max(1, getIntSafe(item, "height", 24));
        int gap = Math.max(0, Math.round((targetTop - lastBottom) / 18f));
        String type = getStringSafe(item, "type");
        String campo = firstNonEmpty(
          getStringSafe(item, "Campo"),
          getStringSafe(item, "campo"),
          getStringSafe(item, "key"),
          getStringSafe(item, "valueKey")
        );
        Log.i(TAG, "[SUNMI_LAYOUT] item " + i + " Campo " + campo + " type " + type);

        try {
          if (gap > 0) {
            callPrinterCommand(callback -> service.lineWrap(gap, callback));
          }

          String value = getStringSafe(item, "value");
          String barcodeValue = firstNonEmpty(
            value,
            getStringSafe(item, "barcode"),
            getStringSafe(item, "internalCode"),
            getStringSafe(item, "code")
          );
          String align = getStringSafe(item, "align");
          boolean italic = getBooleanSafe(item, "italic", false);
          int editorFontSize = Math.max(10, getIntSafe(item, "fontSize", 16));
          int sunmiFontSize = Math.max(10, getIntSafe(item, "sunmiFontSize", editorFontSize));
          int maxLines = Math.max(1, getIntSafe(item, "maxLines", 1));
          String textFontFamily = firstNonEmpty(
            getStringSafe(item, "fontFamily"),
            getStringSafe(item, "tipoFuente"),
            getStringSafe(item, "TipoFuente")
          );
          String normalizedCampo = firstNonEmpty(
            getStringSafe(item, "Campo"),
            getStringSafe(item, "campo"),
            getStringSafe(item, "key"),
            getStringSafe(item, "valueKey")
          ).toLowerCase(Locale.ROOT);

          if ("barcode".equalsIgnoreCase(type)) {
            Log.i(TAG, "[SUNMI_LAYOUT] barcode raw value=" + barcodeValue);
            if (!barcodeValue.isEmpty()) {
              if (PRINT_BARCODE_AS_TEXT) {
                Log.i(TAG, "[SUNMI_LAYOUT] barcode printed as text value=" + barcodeValue);
                callPrinterCommand(callback -> service.setAlignment(resolveAlignmentValue(align), callback));
                callPrinterCommand(callback -> service.setFontSize(18f, callback));
                callPrinterCommand(callback -> service.printText(barcodeValue + "\n", callback));
                continue;
              }
              int symbology = resolveBarcodeSymbology(
                getStringSafe(item, "barcodeType"),
                barcodeValue
              );
              int height = 120;
              int width = 2;
              int textposition = 2;
              Log.i(TAG, "[SUNMI_LAYOUT] barcode symbology=" + symbology + " height=" + height + " width=" + width + " textposition=" + textposition);
              try {
                callPrinterCommand(callback -> service.setAlignment(1, callback));
                callPrinterCommand(callback -> service.printBarCode(barcodeValue, symbology, height, width, textposition, callback));
                Log.i(TAG, "[SUNMI_LAYOUT] barcode printed");
              } catch (Exception barcodeError) {
                Log.e(TAG, "[SUNMI_LAYOUT] barcode failed fallback text", barcodeError);
                callPrinterCommand(callback -> service.setAlignment(resolveAlignmentValue(align), callback));
                callPrinterCommand(callback -> service.setFontSize(18f, callback));
                callPrinterCommand(callback -> service.printText(barcodeValue + "\n", callback));
              }
              continue;
            } else {
              Log.i(TAG, "[SUNMI_LAYOUT] barcode skipped empty value");
            }
          } else if ("separator".equalsIgnoreCase(type)) {
            int separatorWidth = Math.max(12, Math.min(48, Math.round(getIntSafe(item, "width", 240) / 8f)));
            String separator = repeatChar('-', separatorWidth);
            Log.i(TAG, "[SUNMI] print separator");
            callPrinterCommand(callback -> service.setAlignment(1, callback));
            callPrinterCommand(callback -> service.printText(separator + "\n", callback));
          } else {
            String text = value.trim();
            if (!text.isEmpty()) {
              boolean isDescription =
                normalizedCampo.contains("descripcion") ||
                normalizedCampo.contains("description");
              boolean isCompany =
                normalizedCampo.contains("empresa") ||
                normalizedCampo.contains("companyname");
              boolean isPrice =
                normalizedCampo.contains("precio") ||
                normalizedCampo.contains("price");
              String printableText = text;
              int textMaxLines = 1;
              int textMaxChars = 32;

              if (isDescription) {
                textMaxLines = Math.max(2, maxLines);
                textMaxChars = 26;
                printableText = limitLines(text, textMaxChars, textMaxLines);
                Log.i(TAG, "[SUNMI_LAYOUT] description wrapped maxLines=" + textMaxLines);
              } else if (isCompany) {
                textMaxLines = 1;
                textMaxChars = 28;
                printableText = limitLines(text, textMaxChars, textMaxLines);
              } else if (isPrice) {
                textMaxLines = 1;
                textMaxChars = 32;
                printableText = limitLines(text, textMaxChars, textMaxLines);
              } else {
                textMaxLines = 1;
                textMaxChars = 32;
                printableText = limitLines(text, textMaxChars, textMaxLines);
              }

              final String textToPrint = printableText;
              final float fontSizeToPrint = (float) Math.max(18, sunmiFontSize);
              boolean wantsMonospace = isMonospaceFont(textFontFamily);
              Log.i(TAG, "[SUNMI_LAYOUT] text campo=" + getStringSafe(item, "Campo") + " valueLength=" + text.length());
              Log.i(TAG, "[PRINT_LAYOUT] item=" + type + " campo=" + getStringSafe(item, "key") + " editorFontSize=" + editorFontSize + " sunmiFontSize=" + sunmiFontSize);
              Log.i(TAG, "[SUNMI] print text type=" + type);
              callPrinterCommand(callback -> service.setAlignment(resolveAlignmentValue(align), callback));
              if (italic || wantsMonospace) {
                String nativeFont = wantsMonospace ? "monospace" : "serif";
                callPrinterCommand(callback -> service.printTextWithFont(textToPrint + "\n", nativeFont, fontSizeToPrint, callback));
              } else {
                callPrinterCommand(callback -> service.setFontSize(fontSizeToPrint, callback));
                callPrinterCommand(callback -> service.printText(textToPrint + "\n", callback));
              }
            }
          }
        } catch (Exception itemError) {
          Log.e(TAG, "[SUNMI_LAYOUT] item " + i + " failed, continuing", itemError);
        } finally {
          lastBottom = targetTop + itemHeight;
        }
      }

      callPrinterCommand(callback -> service.lineWrap(1, callback));
    }
    Log.i(TAG, "[SUNMI] print layout done");
  }

  private String wrapText(String text, int maxChars) {
    String value = String.valueOf(text == null ? "" : text).trim();
    if (value.isEmpty() || maxChars <= 0) {
      return value;
    }

    String[] words = value.split("\\s+");
    StringBuilder out = new StringBuilder();
    StringBuilder line = new StringBuilder();

    for (String word : words) {
      if (word.isEmpty()) {
        continue;
      }

      if (line.length() == 0) {
        line.append(word);
        continue;
      }

      if (line.length() + 1 + word.length() <= maxChars) {
        line.append(' ').append(word);
        continue;
      }

      if (out.length() > 0) {
        out.append('\n');
      }
      out.append(line);
      line.setLength(0);
      line.append(word);
    }

    if (line.length() > 0) {
      if (out.length() > 0) {
        out.append('\n');
      }
      out.append(line);
    }

    return out.toString();
  }

  private String limitLines(String text, int maxChars, int maxLines) {
    String wrapped = wrapText(text, maxChars);
    if (wrapped.isEmpty()) {
      return wrapped;
    }

    int safeMaxLines = Math.max(1, maxLines);
    String[] lines = wrapped.split("\\r?\\n");
    if (lines.length <= safeMaxLines) {
      return wrapped;
    }

    StringBuilder out = new StringBuilder();
    for (int i = 0; i < safeMaxLines; i++) {
      if (i > 0) {
        out.append('\n');
      }
      out.append(lines[i]);
    }
    return out.toString();
  }

  private String repeatChar(char ch, int count) {
    int safeCount = Math.max(0, count);
    StringBuilder builder = new StringBuilder(safeCount);
    for (int i = 0; i < safeCount; i++) {
      builder.append(ch);
    }
    return builder.toString();
  }

  private String getStringSafe(ReadableMap map, String key) {
    if (map != null && map.hasKey(key) && !map.isNull(key)) {
      try {
        String stringValue = map.getString(key);
        if (stringValue != null) {
          return stringValue.trim();
        }
      } catch (Exception ignored) {
        try {
          return String.valueOf(map.getInt(key)).trim();
        } catch (Exception ignoredToo) {
          try {
            return String.valueOf(map.getDouble(key)).trim();
          } catch (Exception ignoredThree) {
            return "";
          }
        }
      }
    }
    return "";
  }

  private int getIntSafe(ReadableMap map, String key, int fallback) {
    if (map == null || !map.hasKey(key) || map.isNull(key)) {
      return fallback;
    }

    try {
      return map.getInt(key);
    } catch (Exception ignored) {
      try {
        return (int) Math.round(map.getDouble(key));
      } catch (Exception ignoredToo) {
        try {
          return Integer.parseInt(String.valueOf(map.getString(key)).trim());
        } catch (Exception ignoredThree) {
          return fallback;
        }
      }
    }
  }

  private boolean getBooleanSafe(ReadableMap map, String key, boolean fallback) {
    if (map == null || !map.hasKey(key) || map.isNull(key)) {
      return fallback;
    }

    try {
      return map.getBoolean(key);
    } catch (Exception ignored) {
      try {
        return map.getInt(key) != 0;
      } catch (Exception ignoredToo) {
        String value = String.valueOf(map.getString(key)).trim().toLowerCase(Locale.ROOT);
        if (value.isEmpty()) {
          return fallback;
        }
        return "1".equals(value) || "true".equals(value) || "yes".equals(value);
      }
    }
  }

  private String firstNonEmpty(String... values) {
    if (values == null) {
      return "";
    }

    for (String value : values) {
      String text = String.valueOf(value == null ? "" : value).trim();
      if (!text.isEmpty()) {
        return text;
      }
    }

    return "";
  }

  private boolean isMonospaceFont(String fontFamily) {
    String normalized = String.valueOf(fontFamily == null ? "" : fontFamily)
      .trim()
      .toLowerCase(Locale.ROOT);
    return "monospace".equals(normalized)
      || "barcode".equals(normalized)
      || "codigodebarra".equals(normalized)
      || "codigo de barra".equals(normalized)
      || "courier".equals(normalized)
      || "courier new".equals(normalized)
      || "couriernew".equals(normalized)
      || "consolas".equals(normalized);
  }

  private int resolveBarcodeSymbology(String barcodeType, String code) {
    String normalizedType = String.valueOf(barcodeType == null ? "" : barcodeType)
      .trim()
      .toUpperCase(Locale.ROOT);
    String normalizedCode = String.valueOf(code == null ? "" : code).trim();

    if ("EAN8".equals(normalizedType) || normalizedCode.matches("\\d{8}")) {
      return 3;
    }
    if ("EAN13".equals(normalizedType) || normalizedCode.matches("\\d{13}")) {
      return 2;
    }
    if ("CODE39".equals(normalizedType)) {
      return 4;
    }
    return 8;
  }

  private int resolveAlignmentValue(String alignment) {
    String normalized = String.valueOf(alignment == null ? "" : alignment).trim().toLowerCase(Locale.ROOT);
    if ("left".equals(normalized) || "izquierda".equals(normalized)) {
      return 0;
    }
    if ("right".equals(normalized) || "derecha".equals(normalized)) {
      return 2;
    }
    return 1;
  }

  private interface PrinterInvoker {
    void invoke(ICallback callback) throws Exception;
  }

  private void callPrinterCommand(PrinterInvoker invoker) throws Exception {
    final CountDownLatch latch = new CountDownLatch(1);
    final AtomicReference<String> errorRef = new AtomicReference<>("");
    final AtomicReference<Boolean> successRef = new AtomicReference<>(Boolean.FALSE);

    invoker.invoke(new ICallback.Stub() {
      @Override
      public void onPrintResult(int par1, String par2) {
        Log.d(TAG, "print result: " + par1 + ", " + par2);
      }

      @Override
      public void onRunResult(boolean isSuccess) {
        successRef.set(isSuccess);
        latch.countDown();
      }

      @Override
      public void onReturnString(String result) {
        successRef.set(Boolean.TRUE);
        latch.countDown();
      }

      @Override
      public void onRaiseException(int code, String msg) {
        errorRef.set(String.valueOf(code) + ": " + msg);
        latch.countDown();
      }
    });

    boolean completed = latch.await(6, TimeUnit.SECONDS);
    if (!completed) {
      throw new Exception("Timeout en operación Sunmi.");
    }

    String error = errorRef.get();
    if (error != null && !error.trim().isEmpty()) {
      throw new Exception(error);
    }

    Boolean success = successRef.get();
    if (success != null && !success) {
      throw new Exception("Operación Sunmi fallida.");
    }
  }
}
