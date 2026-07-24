package com.alfagestion.alfascan.sunmi;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
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
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import java.lang.reflect.Method;

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
import java.util.EnumMap;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import woyou.aidlservice.jiuiv5.ICallback;
import woyou.aidlservice.jiuiv5.IWoyouService;

public class SunmiDiagnosticsModule extends ReactContextBaseJavaModule {
  private static final String TAG = "SunmiDiagnostics";
  private static final String MODULE_NAME = "SunmiDiagnostics";
  private static final String SUNMI_PACKAGE = "woyou.aidlservice.jiuiv5";
  private static final String SUNMI_ACTION = "woyou.aidlservice.jiuiv5.IWoyouService";
  private static final boolean PRINT_BARCODE_AS_BITMAP = true;

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
      int postPrintFeedLines = Math.max(0, getIntSafe(payload, "postPrintFeedLines", 3));
      int paperWidthPx = Math.max(0, getIntSafe(payload, "paperWidthPx", 0));
      int paperHeightPx = Math.max(0, getIntSafe(payload, "paperHeightPx", 0));
      int paperWidthMm = Math.max(0, getIntSafe(payload, "paperWidthMm", 0));
      int paperHeightMm = Math.max(0, getIntSafe(payload, "paperHeightMm", 0));
      int printableWidthPx = Math.max(0, getIntSafe(payload, "printableWidthPx", 0));
      int printScalePercent = Math.max(10, getIntSafe(payload, "printScalePercent", 100));
      int printOffsetX = getIntSafe(payload, "printOffsetX", 0);
      int printOffsetY = getIntSafe(payload, "printOffsetY", 0);
      int printMarginLeftPx = Math.max(0, getIntSafe(payload, "printMarginLeftPx", 0));
      int printMarginTopPx = Math.max(0, getIntSafe(payload, "printMarginTopPx", 0));
      int printMarginRightPx = Math.max(0, getIntSafe(payload, "printMarginRightPx", 0));
      int printMarginBottomPx = Math.max(0, getIntSafe(payload, "printMarginBottomPx", 0));
      boolean printTestMode = getBooleanSafe(payload, "printTestMode", false);
      boolean printAutoCenter = getBooleanSafe(payload, "printAutoCenter", false);
      boolean printRemoveSystemMargin = getBooleanSafe(payload, "printRemoveSystemMargin", true);
      int printExtraTopFeedPx = Math.max(0, getIntSafe(payload, "printExtraTopFeedPx", 0));
      int printExtraBottomFeedPx = Math.max(0, getIntSafe(payload, "printExtraBottomFeedPx", 0));
      boolean printEdgeToEdge = getBooleanSafe(payload, "printEdgeToEdge", false);
      ReadableArray items = payload.hasKey("items") && !payload.isNull("items") ? payload.getArray("items") : null;
      if (items != null && items.size() > 0) {
        printLayoutItemsInternal(printerService, items, copies, postPrintFeedLines, paperWidthPx, paperHeightPx, paperWidthMm, paperHeightMm, printableWidthPx, printScalePercent, printOffsetX, printOffsetY, printMarginLeftPx, printMarginTopPx, printMarginRightPx, printMarginBottomPx, printTestMode, printAutoCenter, printRemoveSystemMargin, printExtraTopFeedPx, printExtraBottomFeedPx, printEdgeToEdge);
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
  @ReactMethod
  public void printCalibrationTestPage(ReadableMap payload, Promise promise) {
    if (printerService == null || !bound) {
      promise.reject("SERVICE_NOT_CONNECTED", "Servicio no conectado.");
      return;
    }

    try {
      int paperWidthPx = Math.max(1, getIntSafe(payload, "paperWidthPx", 360));
      int paperHeightPx = Math.max(1, getIntSafe(payload, "paperHeightPx", 240));
      int paperWidthMm = Math.max(1, getIntSafe(payload, "paperWidthMm", 90));
      int paperHeightMm = Math.max(1, getIntSafe(payload, "paperHeightMm", 60));
      int printableWidthPx = Math.max(1, getIntSafe(payload, "printableWidthPx", paperWidthPx));
      int printScalePercent = Math.max(10, getIntSafe(payload, "printScalePercent", 100));
      int printOffsetX = getIntSafe(payload, "printOffsetX", 0);
      int printOffsetY = getIntSafe(payload, "printOffsetY", 0);
      String deviceModel = firstNonEmpty(
        getStringSafe(payload, "deviceModel"),
        getStringSafe(payload, "printerModel"),
        getStringSafe(payload, "model"),
        String.valueOf(Build.MODEL)
      );
      String formatLabel = firstNonEmpty(
        getStringSafe(payload, "formatLabel"),
        getStringSafe(payload, "formatName"),
        getStringSafe(payload, "formatKey"),
        "Etiqueta"
      );

      Log.i(TAG, "[SUNMI_CALIBRATION] start format=" + formatLabel);

      Bitmap labelBitmap = renderCalibrationBitmap(
        paperWidthPx,
        paperHeightPx,
        paperWidthMm,
        paperHeightMm,
        printableWidthPx,
        printScalePercent,
        printOffsetX,
        printOffsetY,
        deviceModel,
        formatLabel
      );
      Bitmap finalBitmap = composeBitmapForPrinter(
        labelBitmap,
        printableWidthPx,
        printOffsetX,
        printOffsetY,
        paperWidthMm,
        paperHeightMm,
        0,
        0,
        0,
        0,
        printScalePercent,
        false,
        false,
        true,
        0,
        0,
        true
      );

      Log.i(TAG, "[SUNMI_CALIBRATION] bitmap template=" + labelBitmap.getWidth() + "x" + labelBitmap.getHeight());
      Log.i(TAG, "[SUNMI_CALIBRATION] bitmap print=" + finalBitmap.getWidth() + "x" + finalBitmap.getHeight());

      callPrinterCommand(callback -> printerService.printerInit(callback));
      callPrinterCommand(callback -> printerService.setAlignment(0, callback));
      callPrinterCommand(callback -> printerService.printBitmap(finalBitmap, callback));
      callPrinterCommand(callback -> printerService.lineWrap(1, callback));

      WritableMap result = Arguments.createMap();
      result.putBoolean("printed", true);
      result.putInt("paperWidthPx", paperWidthPx);
      result.putInt("paperHeightPx", paperHeightPx);
      result.putInt("printableWidthPx", printableWidthPx);
      result.putInt("printScalePercent", printScalePercent);
      result.putInt("printOffsetX", printOffsetX);
      result.putInt("printOffsetY", printOffsetY);
      promise.resolve(result);
    } catch (Exception e) {
      lastError = e.getMessage();
      Log.e(TAG, "[SUNMI_CALIBRATION] error", e);
      promise.reject("SUNMI_CALIBRATION_ERROR", e.getMessage(), e);
    }
  }

  private Bitmap renderCalibrationBitmap(
    int paperWidthPx,
    int paperHeightPx,
    int paperWidthMm,
    int paperHeightMm,
    int printableWidthPx,
    int printScalePercent,
    int printOffsetX,
    int printOffsetY,
    String deviceModel,
    String formatLabel
  ) {
    Bitmap bitmap = Bitmap.createBitmap(Math.max(1, paperWidthPx), Math.max(1, paperHeightPx), Bitmap.Config.ARGB_8888);
    Canvas canvas = new Canvas(bitmap);
    canvas.drawColor(Color.WHITE);

    float pxPerMm = resolvePixelsPerMm(paperWidthPx, paperHeightPx, paperWidthMm, paperHeightMm);
    int width = bitmap.getWidth();
    int height = bitmap.getHeight();

    Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
    border.setColor(Color.BLACK);
    border.setStyle(Paint.Style.STROKE);
    border.setStrokeWidth(Math.max(1f, pxPerMm / 2f));
    canvas.drawRect(new RectF(0, 0, Math.max(1, width - 1), Math.max(1, height - 1)), border);

    drawMmRuler(canvas, width, height, paperWidthMm, paperHeightMm, pxPerMm);
    drawCornerX(canvas, 0, 0, Math.round(pxPerMm * 6f), border);
    drawCornerX(canvas, width - 1, 0, Math.round(pxPerMm * 6f), border);
    drawCornerX(canvas, 0, height - 1, Math.round(pxPerMm * 6f), border);
    drawCornerX(canvas, width - 1, height - 1, Math.round(pxPerMm * 6f), border);

    int infoWidth = Math.max(140, Math.min(width - 20, Math.round(width * 0.46f)));
    int infoHeight = Math.max(96, Math.round(height * 0.34f));
    int infoX = Math.max(10, width - infoWidth - Math.round(pxPerMm * 3f));
    int infoY = Math.max(Math.round(pxPerMm * 5f), Math.round(pxPerMm * 4f));
    String infoText =
      "Modelo:\n" +
      deviceModel + "\n\n" +
      "Plantilla:\n" +
      paperWidthMm + " x " + paperHeightMm + " mm\n\n" +
      "Bitmap:\n" +
      width + " x " + height + " px\n\n" +
      "Printer Width:\n" +
      printableWidthPx + " dots\n\n" +
      "Escala:\n" +
      printScalePercent + " %\n\n" +
      "Offset X:\n" +
      printOffsetX + "\n\n" +
      "Offset Y:\n" +
      printOffsetY;
    drawTextBlock(
      canvas,
      infoText,
      infoX,
      infoY,
      infoWidth,
      infoHeight,
      Math.max(11, Math.round(pxPerMm * 3f)),
      "left",
      "Default",
      true,
      false,
      16
    );

    return bitmap;
  }

  private float resolvePixelsPerMm(int paperWidthPx, int paperHeightPx, int paperWidthMm, int paperHeightMm) {
    float total = 0f;
    int count = 0;
    if (paperWidthPx > 0 && paperWidthMm > 0) {
      total += (float) paperWidthPx / (float) paperWidthMm;
      count += 1;
    }
    if (paperHeightPx > 0 && paperHeightMm > 0) {
      total += (float) paperHeightPx / (float) paperHeightMm;
      count += 1;
    }
    if (count <= 0) {
      return 4f;
    }
    return Math.max(1f, total / count);
  }

  private void drawMmRuler(Canvas canvas, int width, int height, int paperWidthMm, int paperHeightMm, float pxPerMm) {
    Paint tickPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    tickPaint.setColor(Color.BLACK);
    tickPaint.setStyle(Paint.Style.STROKE);
    tickPaint.setStrokeWidth(Math.max(1f, pxPerMm / 4f));
    tickPaint.setTextSize(Math.max(10f, pxPerMm * 3f));
    tickPaint.setFakeBoldText(false);

    int topTickSmall = Math.max(4, Math.round(pxPerMm * 2f));
    int topTickLarge = Math.max(topTickSmall + 4, Math.round(pxPerMm * 4f));
    for (int mm = 0; mm <= paperWidthMm; mm += 1) {
      int x = Math.round(mm * pxPerMm);
      if (x > width) {
        continue;
      }
      int tickEnd = mm % 10 == 0 ? topTickLarge : topTickSmall;
      canvas.drawLine(x, 0, x, Math.min(height - 1, tickEnd), tickPaint);
      if (mm % 10 == 0) {
        canvas.drawText(String.valueOf(mm), Math.max(0, x + 2), Math.max(topTickLarge + Math.round(pxPerMm * 2f), 12), tickPaint);
      }
    }

    int leftTickSmall = Math.max(4, Math.round(pxPerMm * 2f));
    int leftTickLarge = Math.max(leftTickSmall + 4, Math.round(pxPerMm * 4f));
    for (int mm = 0; mm <= paperHeightMm; mm += 1) {
      int y = Math.round(mm * pxPerMm);
      if (y > height) {
        continue;
      }
      int tickEnd = mm % 10 == 0 ? leftTickLarge : leftTickSmall;
      canvas.drawLine(0, y, Math.min(width - 1, tickEnd), y, tickPaint);
      if (mm % 10 == 0) {
        canvas.drawText(String.valueOf(mm), 2, Math.max(12, y - 2), tickPaint);
      }
    }
  }

  private void drawCornerX(Canvas canvas, int x, int y, int size, Paint paint) {
    int safeSize = Math.max(4, size);
    int half = safeSize / 2;
    canvas.drawLine(
      Math.max(0, x - half),
      Math.max(0, y - half),
      Math.max(0, x + half),
      Math.max(0, y + half),
      paint
    );
    canvas.drawLine(
      Math.max(0, x - half),
      Math.max(0, y + half),
      Math.max(0, x + half),
      Math.max(0, y - half),
      paint
    );
  }

  private void applyBitmapPrintWidth(IWoyouService service, int printableWidthPx) {
    invokeOptionalPrinterIntCommand(service, "setPrintWidth", Math.max(1, printableWidthPx));
  }

  private void applyBitmapLeftSpace(IWoyouService service, int leftSpacePx) {
    invokeOptionalPrinterIntCommand(service, "setLeftSpace", Math.max(0, leftSpacePx));
  }

  private void invokeOptionalPrinterIntCommand(IWoyouService service, String methodName, int value) {
    if (service == null) {
      return;
    }

    try {
      Method method = service.getClass().getMethod(methodName, int.class, ICallback.class);
      callPrinterCommand(callback -> {
        try {
          method.invoke(service, value, callback);
        } catch (Exception error) {
          throw new RuntimeException(error);
        }
      });
    } catch (NoSuchMethodException ignored) {
      Log.i(TAG, "[SUNMI_LAYOUT] optional method not available: " + methodName);
    } catch (Exception error) {
      Log.i(TAG, "[SUNMI_LAYOUT] optional method failed: " + methodName + " " + error.getMessage());
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
    boolean innerPrinterVisible = isInnerPrinterAvailableInternal();

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
      lastError = innerPrinterVisible ? "Error de bind." : "Servicio no encontrado.";
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

  private void printLayoutItemsInternal(IWoyouService service, ReadableArray items, int copies, int postPrintFeedLines, int paperWidthPx, int paperHeightPx, int paperWidthMm, int paperHeightMm, int printableWidthPx, int printScalePercent, int printOffsetX, int printOffsetY, int printMarginLeftPx, int printMarginTopPx, int printMarginRightPx, int printMarginBottomPx, boolean printTestMode, boolean printAutoCenter, boolean printRemoveSystemMargin, int printExtraTopFeedPx, int printExtraBottomFeedPx, boolean printEdgeToEdge) throws Exception {
    int totalCopies = Math.max(1, copies);
    int finalFeedLines = Math.max(0, postPrintFeedLines);
    Log.i(TAG, "[SUNMI_LAYOUT] received items " + items.size());
    Log.i(TAG, "[SUNMI_LAYOUT] PRINT_BARCODE_AS_BITMAP=" + PRINT_BARCODE_AS_BITMAP);
    callPrinterCommand(callback -> service.printerInit(callback));

    for (int copy = 0; copy < totalCopies; copy++) {
      if (copy > 0) {
        callPrinterCommand(callback -> service.lineWrap(1, callback));
      }

      if (paperWidthPx <= 1) {
        paperWidthPx = 320;
      }
      if (paperHeightPx <= 1) {
        int maxBottom = 0;
        for (int i = 0; i < items.size(); i++) {
          ReadableMap item = items.getMap(i);
          if (item == null) {
            continue;
          }
          maxBottom = Math.max(
            maxBottom,
            getIntSafe(item, "y", 0) + getIntSafe(item, "height", 24)
          );
        }
        paperHeightPx = Math.max(240, maxBottom + 24);
      }

      Log.i(TAG, "[SUNMI_LAYOUT] TEMPLATE SIZE: paperWidthPx=" + paperWidthPx + " paperHeightPx=" + paperHeightPx);
      Log.i(TAG, "[SUNMI_LAYOUT] PRINTABLE WIDTH PX: " + printableWidthPx);
      Log.i(TAG, "[SUNMI_LAYOUT] AREA UTIL IMPRESORA: width=" + paperWidthPx + " height=" + paperHeightPx);
      Log.i(TAG, "IMPRIMIENDO ELEMENTOS:");
      for (int i = 0; i < items.size(); i++) {
        ReadableMap item = items.getMap(i);
        if (item == null) {
          continue;
        }
        String orden = String.valueOf(getIntSafe(item, "Orden", getIntSafe(item, "orden", i + 1)));
        String tipoElemento = firstNonEmpty(
          getStringSafe(item, "TipoElemento"),
          getStringSafe(item, "tipoElemento"),
          getStringSafe(item, "type"),
          "text"
        );
        String campo = firstNonEmpty(
          getStringSafe(item, "Campo"),
          getStringSafe(item, "campo"),
          getStringSafe(item, "key"),
          getStringSafe(item, "valueKey")
        );
        String textoFijo = firstNonEmpty(
          getStringSafe(item, "TextoFijo"),
          getStringSafe(item, "textoFijo")
        );
        String textoFinal = firstNonEmpty(
          getStringSafe(item, "value"),
          textoFijo,
          getStringSafe(item, "sampleText")
        );
        Log.i(
          TAG,
          orden + " | " +
            tipoElemento + " | " +
            campo + " | " +
            textoFijo + " | " +
            getIntSafe(item, "x", 0) + " | " +
            getIntSafe(item, "y", 0) + " | " +
            getIntSafe(item, "width", 0) + " | " +
            getIntSafe(item, "height", 0) + " | " +
            textoFinal
        );
        Log.i(
          TAG,
          "[SUNMI_LAYOUT] rect final " +
            "tipo=" + tipoElemento +
            " campo=" + campo +
            " texto=" + textoFinal +
            " x=" + getIntSafe(item, "x", 0) +
            " y=" + getIntSafe(item, "y", 0) +
            " w=" + getIntSafe(item, "width", 0) +
            " h=" + getIntSafe(item, "height", 0) +
            " align=" + firstNonEmpty(getStringSafe(item, "align"), getStringSafe(item, "Alineacion"), "left") +
            " fontSize=" + getIntSafe(item, "sunmiFontSize", getIntSafe(item, "fontSize", 16))
        );
      }
      Bitmap labelBitmap = renderLayoutBitmap(items, paperWidthPx, paperHeightPx);
      Bitmap finalBitmap = composeBitmapForPrinter(
        labelBitmap,
        printableWidthPx,
        printOffsetX,
        printOffsetY,
        paperWidthMm,
        paperHeightMm,
        printMarginLeftPx,
        printMarginTopPx,
        printMarginRightPx,
        printMarginBottomPx,
        printScalePercent,
        printTestMode,
        printAutoCenter,
        printRemoveSystemMargin,
        printExtraTopFeedPx,
        printExtraBottomFeedPx,
        printEdgeToEdge
      );
      Log.i(TAG, "[SUNMI_LAYOUT] bitmap template=" + labelBitmap.getWidth() + "x" + labelBitmap.getHeight());
      Log.i(TAG, "[SUNMI_LAYOUT] bitmap print=" + finalBitmap.getWidth() + "x" + finalBitmap.getHeight());
      applyBitmapPrintWidth(service, printableWidthPx);
      applyBitmapLeftSpace(service, 0);
      callPrinterCommand(callback -> service.setAlignment(0, callback));
      callPrinterCommand(callback -> service.printBitmap(finalBitmap, callback));
      callPrinterCommand(callback -> service.lineWrap(1, callback));
    }
    if (finalFeedLines > 0) {
      for (int i = 0; i < finalFeedLines; i++) {
        callPrinterCommand(callback -> service.printText("\n", callback));
      }
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

  private String limitWrappedText(String text, int maxChars, int maxLines) {
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

  private String limitLines(String text, int maxChars, int maxLines) {
    return limitWrappedText(text, maxChars, maxLines);
  }

  private Bitmap createBarcodeBitmap(String value, String barcodeType, int width, int height) throws WriterException {
    String normalizedValue = String.valueOf(value == null ? "" : value).trim();
    if (normalizedValue.isEmpty()) {
      throw new WriterException("Barcode vacío.");
    }

    int safeWidth = Math.max(1, width);
    int safeHeight = Math.max(1, height);
    Bitmap bitmap;
    BarcodeFormat format = shouldTryEan13(barcodeType, normalizedValue)
      ? BarcodeFormat.EAN_13
      : BarcodeFormat.CODE_128;

    try {
      bitmap = encodeBarcode(normalizedValue, format, safeWidth, safeHeight);
    } catch (WriterException e) {
      if (format != BarcodeFormat.CODE_128) {
        bitmap = encodeBarcode(normalizedValue, BarcodeFormat.CODE_128, safeWidth, safeHeight);
      } else {
        throw e;
      }
    }

    return bitmap;
  }

  private boolean shouldTryEan13(String barcodeType, String value) {
    String normalizedType = String.valueOf(barcodeType == null ? "" : barcodeType)
      .trim()
      .toLowerCase(Locale.ROOT);
    String digitsOnly = String.valueOf(value == null ? "" : value).replaceAll("\\D", "");
    return digitsOnly.matches("\\d{13}")
      && (normalizedType.isEmpty()
        || normalizedType.contains("ean13")
        || normalizedType.contains("ean")
        || normalizedType.contains("jan"));
  }

  private Bitmap encodeBarcode(String value, BarcodeFormat format, int width, int height) throws WriterException {
    Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
    hints.put(EncodeHintType.MARGIN, 0);
    BitMatrix matrix = new MultiFormatWriter().encode(value, format, width, height, hints);
    Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
    for (int x = 0; x < width; x++) {
      for (int y = 0; y < height; y++) {
        bitmap.setPixel(x, y, matrix.get(x, y) ? Color.BLACK : Color.WHITE);
      }
    }
    return bitmap;
  }

  private Bitmap createSeparatorBitmap(int width, int thickness) {
    int safeWidth = Math.max(1, width);
    int safeThickness = Math.max(1, thickness);
    Bitmap bitmap = Bitmap.createBitmap(safeWidth, safeThickness, Bitmap.Config.ARGB_8888);
    Canvas canvas = new Canvas(bitmap);
    Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    paint.setColor(Color.BLACK);
    paint.setStyle(Paint.Style.FILL);
    canvas.drawColor(Color.TRANSPARENT);
    float top = Math.max(0, (safeThickness - 1) / 2f);
    canvas.drawRect(new RectF(0, top, safeWidth, top + 1f), paint);
    return bitmap;
  }

  private Bitmap createRectangleBitmap(int width, int height, int borderWidth) {
    int safeWidth = Math.max(1, width);
    int safeHeight = Math.max(1, height);
    int safeBorder = Math.max(1, borderWidth);
    Bitmap bitmap = Bitmap.createBitmap(safeWidth, safeHeight, Bitmap.Config.ARGB_8888);
    Canvas canvas = new Canvas(bitmap);
    Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    paint.setColor(Color.BLACK);
    paint.setStyle(Paint.Style.STROKE);
    paint.setStrokeWidth(safeBorder);
    canvas.drawColor(Color.TRANSPARENT);
    RectF rect = new RectF(
      safeBorder / 2f,
      safeBorder / 2f,
      safeWidth - (safeBorder / 2f),
      safeHeight - (safeBorder / 2f)
    );
    canvas.drawRect(rect, paint);
    return bitmap;
  }

  private Bitmap renderLayoutBitmap(ReadableArray items, int paperWidthPx, int paperHeightPx) {
    int safeWidth = Math.max(1, paperWidthPx);
    int safeHeight = Math.max(1, paperHeightPx);
    Bitmap bitmap = Bitmap.createBitmap(safeWidth, safeHeight, Bitmap.Config.ARGB_8888);
    Canvas canvas = new Canvas(bitmap);
    canvas.drawColor(Color.WHITE);

    for (int i = 0; i < items.size(); i++) {
      ReadableMap item = items.getMap(i);
      if (item == null) {
        continue;
      }

      boolean visible = getBooleanSafe(item, "visible", true);
      if (!visible) {
        continue;
      }

      String tipoElemento = firstNonEmpty(
        getStringSafe(item, "TipoElemento"),
        getStringSafe(item, "tipoElemento"),
        getStringSafe(item, "type")
      ).toLowerCase(Locale.ROOT);
      String type = firstNonEmpty(
        getStringSafe(item, "type"),
        getStringSafe(item, "TipoElemento"),
        getStringSafe(item, "tipoElemento")
      ).toLowerCase(Locale.ROOT);
      String normalizedType = firstNonEmpty(tipoElemento, type);

      if ("rectangulo".equals(normalizedType)) {
        drawRectangleItem(canvas, item);
        continue;
      }

      if (isLegacyRectangleItem(item, normalizedType)) {
        drawRectangleItem(canvas, item);
        continue;
      }

      if ("linea".equals(normalizedType) || "separator".equals(normalizedType)) {
        drawSeparatorItem(canvas, item);
        continue;
      }

      if ("logo".equals(normalizedType)) {
        drawLogoItem(canvas, item);
        continue;
      }

      if ("barcode".equals(normalizedType) || "codigobarra".equals(normalizedType)) {
        drawBarcodeItem(canvas, item);
        continue;
      }

      drawTextItem(canvas, item);
    }

    return bitmap;
  }

  private Bitmap composeBitmapForPrinter(
    Bitmap source,
    int printableWidthPx,
    int offsetX,
    int offsetY,
    int paperWidthMm,
    int paperHeightMm,
    int marginLeftPx,
    int marginTopPx,
    int marginRightPx,
    int marginBottomPx,
    int scalePercent,
    boolean printTestMode,
    boolean autoCenter,
    boolean removeSystemMargin,
    int extraTopFeedPx,
    int extraBottomFeedPx,
    boolean edgeToEdge
  ) {
    if (source == null) {
      return null;
    }

    Log.i(
      TAG,
        "[SUNMI_LAYOUT] bitmap source=" + source.getWidth() + "x" + source.getHeight() +
        " printableWidthPx=" + printableWidthPx +
        " offsetX=" + offsetX +
        " offsetY=" + offsetY +
        " paperWidthMm=" + paperWidthMm +
        " paperHeightMm=" + paperHeightMm +
        " marginLeftPx=" + marginLeftPx +
        " marginTopPx=" + marginTopPx +
        " marginRightPx=" + marginRightPx +
        " marginBottomPx=" + marginBottomPx +
        " scalePercent=" + scalePercent +
        " testMode=" + printTestMode +
        " autoCenter=" + autoCenter +
        " removeSystemMargin=" + removeSystemMargin +
        " extraTopFeedPx=" + extraTopFeedPx +
        " extraBottomFeedPx=" + extraBottomFeedPx +
        " edgeToEdge=" + edgeToEdge
    );

    float scaleFactor = Math.max(0.1f, Math.min(4.0f, scalePercent / 100f));
    Bitmap sourceToDraw = source;
    if (Math.abs(scaleFactor - 1f) > 0.0001f) {
      int scaledWidth = Math.max(1, Math.round(source.getWidth() * scaleFactor));
      int scaledHeight = Math.max(1, Math.round(source.getHeight() * scaleFactor));
      sourceToDraw = Bitmap.createScaledBitmap(source, scaledWidth, scaledHeight, true);
    }

    int effectiveMarginLeftPx = removeSystemMargin ? 0 : marginLeftPx;
    int drawX = effectiveMarginLeftPx + offsetX;
    int drawY = marginTopPx + offsetY + extraTopFeedPx + Math.max(12, Math.round(sourceToDraw.getHeight() * 0.06f));
    if (!removeSystemMargin && autoCenter) {
      drawX += Math.max(0, (printableWidthPx - sourceToDraw.getWidth()) / 2);
    }
    int leftInset = Math.max(0, drawX);
    int topInset = Math.max(0, drawY);
    int canvasWidth = edgeToEdge
      ? Math.max(1, sourceToDraw.getWidth() + leftInset + Math.max(0, marginRightPx))
      : removeSystemMargin
        ? Math.max(1, sourceToDraw.getWidth() + leftInset + Math.max(0, marginRightPx))
        : Math.max(1, Math.max(sourceToDraw.getWidth() + leftInset + Math.max(0, marginRightPx), printableWidthPx));
    int canvasHeight = edgeToEdge
      ? Math.max(1, sourceToDraw.getHeight() + topInset + Math.max(0, marginBottomPx) + Math.max(0, extraBottomFeedPx))
      : Math.max(1, sourceToDraw.getHeight() + topInset + Math.max(0, marginBottomPx) + Math.max(0, extraBottomFeedPx));
    Bitmap bitmap = Bitmap.createBitmap(canvasWidth, canvasHeight, Bitmap.Config.ARGB_8888);
    Canvas canvas = new Canvas(bitmap);
    Paint background = new Paint(Paint.ANTI_ALIAS_FLAG);
    background.setColor(Color.WHITE);
    canvas.drawRect(new RectF(0, 0, canvasWidth, canvasHeight), background);

    canvas.save();
    canvas.translate(drawX, drawY);
    canvas.drawBitmap(sourceToDraw, 0, 0, null);
    canvas.restore();

    Log.i(
      TAG,
        "[SUNMI_LAYOUT] print offset px x=" + offsetX +
        " y=" + offsetY +
        " canvasWidth=" + canvasWidth +
        " canvasHeight=" + canvasHeight +
        " testMode=" + printTestMode
    );

    if (printTestMode) {
      int footerHeight = Math.max(120, Math.round(Math.max(1f, sourceToDraw.getHeight() * 0.28f)));
      Bitmap calibrated = Bitmap.createBitmap(canvasWidth, canvasHeight + footerHeight, Bitmap.Config.ARGB_8888);
      Canvas calibratedCanvas = new Canvas(calibrated);
      calibratedCanvas.drawColor(Color.WHITE);
      calibratedCanvas.drawBitmap(bitmap, 0, 0, null);
      drawCalibrationOverlay(
        calibratedCanvas,
        canvasWidth,
        canvasHeight + footerHeight,
        sourceToDraw.getWidth(),
        sourceToDraw.getHeight(),
        paperWidthMm,
        paperHeightMm,
        drawX,
        drawY,
        scalePercent,
        footerHeight
      );
      return calibrated;
    }

    return bitmap;
  }

  private void drawCalibrationOverlay(Canvas canvas, int width, int height, int bitmapWidth, int bitmapHeight, int paperWidthMm, int paperHeightMm, int offsetX, int offsetY, int scalePercent, int footerHeight) {
    float pxPerMm = resolvePixelsPerMm(bitmapWidth, bitmapHeight, paperWidthMm, paperHeightMm);

    Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
    border.setColor(Color.BLACK);
    border.setStyle(Paint.Style.STROKE);
    border.setStrokeWidth(2f);
    int labelBottom = Math.max(0, bitmapHeight - 1);
    canvas.drawRect(new RectF(0, 0, Math.max(1, bitmapWidth - 1), Math.max(1, labelBottom)), border);
    canvas.drawLine(0, 0, 0, Math.max(1, labelBottom), border);
    canvas.drawLine(Math.max(0, bitmapWidth - 1), 0, Math.max(0, bitmapWidth - 1), Math.max(1, labelBottom), border);
    canvas.drawLine(0, 0, Math.max(1, bitmapWidth - 1), 0, border);
    canvas.drawLine(0, Math.max(0, labelBottom), Math.max(1, bitmapWidth - 1), Math.max(0, labelBottom), border);
    drawCrosshair(canvas, 0, 0, Math.max(12, Math.round(pxPerMm * 6f)), border);
    drawCrosshair(canvas, Math.max(0, bitmapWidth - 1), 0, Math.max(12, Math.round(pxPerMm * 6f)), border);
    drawCrosshair(canvas, 0, labelBottom, Math.max(12, Math.round(pxPerMm * 6f)), border);
    drawCrosshair(canvas, Math.max(0, bitmapWidth - 1), labelBottom, Math.max(12, Math.round(pxPerMm * 6f)), border);

    drawMmRuler(canvas, bitmapWidth, bitmapHeight, Math.max(1, paperWidthMm), Math.max(1, paperHeightMm), pxPerMm);

    Paint footerTitlePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    footerTitlePaint.setColor(Color.BLACK);
    footerTitlePaint.setTextSize(Math.max(14f, pxPerMm * 3f));
    footerTitlePaint.setFakeBoldText(true);

    Paint footerBodyPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    footerBodyPaint.setColor(Color.BLACK);
    footerBodyPaint.setTextSize(Math.max(11f, pxPerMm * 2.4f));

    int footerTop = Math.max(0, bitmapHeight);
    int footerPadding = Math.max(12, Math.round(pxPerMm * 3f));
    int lineHeight = Math.max(18, Math.round(pxPerMm * 4.2f));
    int textX = footerPadding;
    int textY = footerTop + footerPadding + Math.max(14, Math.round(pxPerMm * 3f));

    canvas.drawLine(0, footerTop, Math.max(1, width - 1), footerTop, border);
    canvas.drawText("Modelo: " + String.valueOf(Build.MODEL), textX, textY, footerTitlePaint);
    textY += lineHeight;
    canvas.drawText(
      "Etiqueta: " + Math.max(1, Math.round((float) bitmapWidth / Math.max(1f, pxPerMm))) + " x " + Math.max(1, Math.round((float) bitmapHeight / Math.max(1f, pxPerMm))) + " mm",
      textX,
      textY,
      footerBodyPaint
    );
    textY += lineHeight;
    canvas.drawText("Bitmap: " + bitmapWidth + " x " + bitmapHeight + " px", textX, textY, footerBodyPaint);
    textY += lineHeight;
    canvas.drawText("Printer Width: " + width + " dots", textX, textY, footerBodyPaint);
    textY += lineHeight;
    canvas.drawText("Escala: " + scalePercent + "%", textX, textY, footerBodyPaint);
    textY += lineHeight;
    canvas.drawText("Offset X: " + offsetX, textX, textY, footerBodyPaint);
    textY += lineHeight;
    canvas.drawText("Offset Y: " + offsetY, textX, textY, footerBodyPaint);
  }

  private void drawCrosshair(Canvas canvas, int x, int y, int size, Paint paint) {
    int safeSize = Math.max(4, size);
    int half = safeSize / 2;
    canvas.drawLine(Math.max(0, x - half), y, Math.max(0, x + half), y, paint);
    canvas.drawLine(x, Math.max(0, y - half), x, Math.max(0, y + half), paint);
  }

  private void drawTextItem(Canvas canvas, ReadableMap item) {
    int x = Math.max(0, getIntSafe(item, "x", 0));
    int y = Math.max(0, getIntSafe(item, "y", 0));
    int width = Math.max(1, getIntSafe(item, "width", 120));
    int height = Math.max(1, getIntSafe(item, "height", 36));
    int fontSize = Math.max(10, getIntSafe(item, "fontSize", getIntSafe(item, "sunmiFontSize", 16)));
    int maxLines = Math.max(1, getIntSafe(item, "maxLines", 1));
    boolean uppercase = getBooleanSafe(item, "uppercase", false) || getBooleanSafe(item, "Mayuscula", false);
    boolean italic = getBooleanSafe(item, "italic", false) || getBooleanSafe(item, "Italica", false);
    String fontWeight = getStringSafe(item, "fontWeight");
    boolean bold = getBooleanSafe(item, "bold", false)
      || getBooleanSafe(item, "Negrita", false)
      || "700".equals(fontWeight)
      || "bold".equalsIgnoreCase(fontWeight);
    String align = firstNonEmpty(
      getStringSafe(item, "align"),
      getStringSafe(item, "Alineacion"),
      "left"
    ).toLowerCase(Locale.ROOT);
    String fontFamily = firstNonEmpty(
      getStringSafe(item, "fontFamily"),
      getStringSafe(item, "tipoFuente"),
      getStringSafe(item, "TipoFuente"),
      "Default"
    );
    String text = firstNonEmpty(
      getStringSafe(item, "value"),
      getStringSafe(item, "TextoFijo"),
      getStringSafe(item, "textoFijo"),
      getStringSafe(item, "sampleText")
    );
    if (uppercase) {
      text = text.toUpperCase(Locale.ROOT);
    }
    if (text.isEmpty()) {
      return;
    }

    TextPaint paint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    paint.setColor(Color.BLACK);
    paint.setTextSize(fontSize);
    paint.setTypeface(resolveTypeface(fontFamily, bold, italic));
    paint.setFakeBoldText(bold);
    if (italic) {
      paint.setTextSkewX(-0.25f);
    }

    Layout.Alignment alignment = resolveLayoutAlignment(align);
    StaticLayout layout = buildStaticLayout(
      text,
      paint,
      width,
      alignment,
      maxLines,
      Math.max(0f, fontSize * 0.18f)
    );

    canvas.save();
    canvas.translate(x, y);
    canvas.clipRect(0, 0, width, height);
    layout.draw(canvas);
    canvas.restore();
  }

  private void drawBarcodeItem(Canvas canvas, ReadableMap item) {
    int x = Math.max(0, getIntSafe(item, "x", 0));
    int y = Math.max(0, getIntSafe(item, "y", 0));
    int width = Math.max(1, getIntSafe(item, "width", 240));
    int height = Math.max(1, getIntSafe(item, "height", 100));
    int fontSize = Math.max(10, getIntSafe(item, "fontSize", getIntSafe(item, "sunmiFontSize", 16)));
    String align = firstNonEmpty(
      getStringSafe(item, "align"),
      getStringSafe(item, "Alineacion"),
      "center"
    ).toLowerCase(Locale.ROOT);
    String barcodeValue = firstNonEmpty(
      getStringSafe(item, "value"),
      getStringSafe(item, "barcode"),
      getStringSafe(item, "internalCode"),
      getStringSafe(item, "code")
    );
    if (barcodeValue.isEmpty()) {
      return;
    }

    boolean showNumber = getBooleanSafe(item, "showNumber", true);
    int barcodeHeight = showNumber ? Math.max(1, height - Math.max(14, Math.round(fontSize * 1.35f)) - 2) : height;
    int numberHeight = showNumber ? Math.max(14, Math.round(fontSize * 1.35f)) : 0;

    try {
      Bitmap barcodeBitmap = createBarcodeBitmap(
        barcodeValue,
        getStringSafe(item, "barcodeType"),
        width,
        barcodeHeight
      );
      canvas.drawBitmap(barcodeBitmap, x, y, null);
    } catch (Exception error) {
      Log.e(TAG, "[SUNMI_LAYOUT] barcode bitmap failed", error);
      drawTextBlock(canvas, barcodeValue, x, y, width, height, fontSize, align, "Default", false, false, 1);
      return;
    }

    if (showNumber) {
      drawTextBlock(
        canvas,
        barcodeValue,
        x,
        y + Math.max(1, barcodeHeight),
        width,
        Math.max(1, numberHeight),
        Math.max(10, fontSize),
        "center",
        "Default",
        false,
        false,
        1
      );
    }
  }

  private void drawSeparatorItem(Canvas canvas, ReadableMap item) {
    int x = Math.max(0, getIntSafe(item, "x", 0));
    int y = Math.max(0, getIntSafe(item, "y", 0));
    int width = Math.max(1, getIntSafe(item, "width", 200));
    int thickness = Math.max(1, getIntSafe(item, "separatorThickness", 2));
    Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    paint.setColor(Color.BLACK);
    paint.setStyle(Paint.Style.FILL);
    float top = y + Math.max(0, (thickness - 1) / 2f);
    canvas.drawRect(new RectF(x, top, x + width, top + 1f), paint);
  }

  private void drawRectangleItem(Canvas canvas, ReadableMap item) {
    int x = Math.max(0, getIntSafe(item, "x", 0));
    int y = Math.max(0, getIntSafe(item, "y", 0));
    int width = Math.max(1, getIntSafe(item, "width", 120));
    int height = Math.max(1, getIntSafe(item, "height", 60));
    int borderWidth = Math.max(1, getIntSafe(item, "borderWidth", getIntSafe(item, "separatorThickness", 2)));
    Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    paint.setColor(Color.BLACK);
    paint.setStyle(Paint.Style.STROKE);
    paint.setStrokeWidth(borderWidth);
    RectF rect = new RectF(
      x + (borderWidth / 2f),
      y + (borderWidth / 2f),
      x + width - (borderWidth / 2f),
      y + height - (borderWidth / 2f)
    );
    canvas.drawRect(rect, paint);
  }

  private void drawLogoItem(Canvas canvas, ReadableMap item) {
    int x = Math.max(0, getIntSafe(item, "x", 0));
    int y = Math.max(0, getIntSafe(item, "y", 0));
    int width = Math.max(1, getIntSafe(item, "width", 120));
    int height = Math.max(1, getIntSafe(item, "height", 40));
    drawTextBlock(
      canvas,
      firstNonEmpty(getStringSafe(item, "value"), getStringSafe(item, "sampleText"), "Alfa"),
      x,
      y,
      width,
      height,
      Math.max(12, getIntSafe(item, "fontSize", getIntSafe(item, "sunmiFontSize", 16))),
      firstNonEmpty(getStringSafe(item, "align"), "center"),
      firstNonEmpty(getStringSafe(item, "tipoFuente"), getStringSafe(item, "TipoFuente"), "Default"),
      getBooleanSafe(item, "bold", false),
      getBooleanSafe(item, "italic", false),
      Math.max(1, getIntSafe(item, "maxLines", 1))
    );
  }

  private boolean isLegacyRectangleItem(ReadableMap item, String normalizedType) {
    if (!"texto".equals(normalizedType) && !"text".equals(normalizedType)) {
      return false;
    }

    String campo = firstNonEmpty(
      getStringSafe(item, "Campo"),
      getStringSafe(item, "campo"),
      getStringSafe(item, "key"),
      getStringSafe(item, "valueKey")
    ).toLowerCase(Locale.ROOT);
    String textoFijo = firstNonEmpty(
      getStringSafe(item, "TextoFijo"),
      getStringSafe(item, "textoFijo")
    );
    int width = Math.max(0, getIntSafe(item, "width", 0));
    int height = Math.max(0, getIntSafe(item, "height", 0));

    return "textofijo".equals(campo) && textoFijo.isEmpty() && width >= 80 && height >= 20;
  }

  private void drawTextBlock(
    Canvas canvas,
    String text,
    int x,
    int y,
    int width,
    int height,
    int fontSize,
    String align,
    String fontFamily,
    boolean bold,
    boolean italic,
    int maxLines
  ) {
    String value = String.valueOf(text == null ? "" : text).trim();
    if (value.isEmpty()) {
      return;
    }

    TextPaint paint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    paint.setColor(Color.BLACK);
    paint.setTextSize(Math.max(10, fontSize));
    paint.setTypeface(resolveTypeface(fontFamily, bold, italic));
    paint.setFakeBoldText(bold);
    if (italic) {
      paint.setTextSkewX(-0.25f);
    }

    Layout.Alignment alignment = resolveLayoutAlignment(align);
    StaticLayout layout = buildStaticLayout(
      value,
      paint,
      width,
      alignment,
      Math.max(1, maxLines),
      Math.max(0f, fontSize * 0.18f)
    );

    canvas.save();
    canvas.translate(x, y);
    canvas.clipRect(0, 0, width, height);
    layout.draw(canvas);
    canvas.restore();
  }

  private StaticLayout buildStaticLayout(
    String text,
    TextPaint paint,
    int width,
    Layout.Alignment alignment,
    int maxLines,
    float lineSpacingExtra
  ) {
    int safeWidth = Math.max(1, width);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      return StaticLayout.Builder.obtain(text, 0, text.length(), paint, safeWidth)
        .setAlignment(alignment)
        .setIncludePad(true)
        .setLineSpacing(Math.max(0f, lineSpacingExtra), 1f)
        .setMaxLines(Math.max(1, maxLines))
        .build();
    }

    return new StaticLayout(
      text,
      paint,
      safeWidth,
      alignment,
      1f,
      Math.max(0f, lineSpacingExtra),
      false
    );
  }

  private Layout.Alignment resolveLayoutAlignment(String align) {
    String normalized = String.valueOf(align == null ? "" : align)
      .trim()
      .toLowerCase(Locale.ROOT);
    if ("right".equals(normalized)) {
      return Layout.Alignment.ALIGN_OPPOSITE;
    }
    if ("center".equals(normalized)) {
      return Layout.Alignment.ALIGN_CENTER;
    }
    return Layout.Alignment.ALIGN_NORMAL;
  }

  private Typeface resolveTypeface(String fontFamily, boolean bold, boolean italic) {
    String normalized = String.valueOf(fontFamily == null ? "" : fontFamily)
      .trim()
      .toLowerCase(Locale.ROOT);
    int style = Typeface.NORMAL;
    if (bold && italic) {
      style = Typeface.BOLD_ITALIC;
    } else if (bold) {
      style = Typeface.BOLD;
    } else if (italic) {
      style = Typeface.ITALIC;
    }

    if (normalized.contains("mono") || normalized.contains("barcode") || normalized.contains("courier") || normalized.contains("consolas")) {
      return Typeface.create(Typeface.MONOSPACE, style);
    }
    if (normalized.contains("serif")) {
      return Typeface.create(Typeface.SERIF, style);
    }
    if (normalized.contains("sans")) {
      return Typeface.create(Typeface.SANS_SERIF, style);
    }
    return Typeface.create(Typeface.DEFAULT, style);
  }

  private int estimateMaxChars(int width, int fontSize) {
    int safeWidth = Math.max(1, width);
    int safeFontSize = Math.max(10, fontSize);
    int estimated = Math.round(safeWidth / Math.max(4f, safeFontSize * 0.55f));
    return Math.max(6, estimated);
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
      .toLowerCase(Locale.ROOT);
    String digitsOnly = String.valueOf(code == null ? "" : code).replaceAll("\\D", "");
    if (normalizedType.contains("ean13") || normalizedType.contains("jan13") || digitsOnly.matches("\\d{13}")) {
      return 2;
    }
    if (normalizedType.contains("ean8") || normalizedType.contains("jan8") || digitsOnly.matches("\\d{8}")) {
      return 3;
    }
    if (normalizedType.contains("code39")) {
      return 4;
    }
    if (normalizedType.contains("itf")) {
      return 5;
    }
    if (normalizedType.contains("codabar")) {
      return 6;
    }
    if (normalizedType.contains("code93")) {
      return 7;
    }
    return 8;
  }

  private String normalizeBarcodeDataForSymbology(String barcodeValue, int symbology) {
    String value = String.valueOf(barcodeValue == null ? "" : barcodeValue).trim();
    if (value.isEmpty()) {
      return value;
    }

    if (symbology == 2 || symbology == 3) {
      return value.replaceAll("\\D", "");
    }

    return value;
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
