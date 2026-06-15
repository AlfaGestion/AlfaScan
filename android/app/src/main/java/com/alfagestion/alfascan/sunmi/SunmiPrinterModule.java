package com.alfagestion.alfascan.sunmi;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.IBinder;
import android.util.Log;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import woyou.aidlservice.jiuiv5.ICallback;
import woyou.aidlservice.jiuiv5.IWoyouService;

public class SunmiPrinterModule extends ReactContextBaseJavaModule {
  private static final String TAG = "SunmiPrinter";
  private static final String MODULE_NAME = "SunmiPrinterModule";
  private static final String SUNMI_PACKAGE = "woyou.aidlservice.jiuiv5";
  private static final String SUNMI_ACTION = "woyou.aidlservice.jiuiv5.IWoyouService";

  private final Object stateLock = new Object();
  private final ReactApplicationContext reactContext;

  private volatile IWoyouService printerService;
  private volatile boolean bound = false;
  private volatile boolean binding = false;
  private volatile boolean innerPrinterAvailable = false;
  private volatile String lastError = "";
  private volatile String printerVersion = "";
  private volatile String printerModal = "";
  private volatile String printerSerialNo = "";
  private volatile String serviceVersion = "";

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
    }
  };

  public SunmiPrinterModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
  }

  @Override
  public String getName() {
    return MODULE_NAME;
  }

  @Override
  public void onCatalystInstanceDestroy() {
    super.onCatalystInstanceDestroy();
    unbindServiceInternal();
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  public boolean hasPrinter() {
    return bound && printerService != null;
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  public String getPrinterVersion() {
    return printerVersion;
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  public String getPrinterModal() {
    return printerModal;
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  public String getPrinterSerialNo() {
    return printerSerialNo;
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  public String getServiceVersion() {
    return serviceVersion;
  }

  @ReactMethod
  public void initPrinter(Promise promise) {
    promise.resolve(bindPrinterServiceInternal());
  }

  @ReactMethod
  public void printerInit(Promise promise) {
    initPrinter(promise);
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
  public void setAlignment(int alignment, Promise promise) {
    try {
      ensurePrinterReady();
      callPrinterCommand(callback -> printerService.setAlignment(alignment, callback));
      promise.resolve(Boolean.TRUE);
    } catch (Exception e) {
      promise.reject("SUNMI_ALIGNMENT_ERROR", e.getMessage(), e);
    }
  }

  @ReactMethod
  public void setFontSize(float size, Promise promise) {
    try {
      ensurePrinterReady();
      callPrinterCommand(callback -> printerService.setFontSize(size, callback));
      promise.resolve(Boolean.TRUE);
    } catch (Exception e) {
      promise.reject("SUNMI_FONT_SIZE_ERROR", e.getMessage(), e);
    }
  }

  @ReactMethod
  public void lineWrap(int count, Promise promise) {
    try {
      ensurePrinterReady();
      int safeCount = Math.max(0, count);
      if (safeCount > 0) {
        callPrinterCommand(callback -> printerService.lineWrap(safeCount, callback));
      }
      promise.resolve(Boolean.TRUE);
    } catch (Exception e) {
      promise.reject("SUNMI_LINE_WRAP_ERROR", e.getMessage(), e);
    }
  }

  @ReactMethod
  public void printText(String text, Promise promise) {
    printTextInternal(text, promise);
  }

  @ReactMethod
  public void printString(String text, Promise promise) {
    printTextInternal(text, promise);
  }

  @ReactMethod
  public void printOriginalText(String text, Promise promise) {
    try {
      ensurePrinterReady();
      String value = normalizeText(text);
      if (value.isEmpty()) {
        promise.resolve(Boolean.FALSE);
        return;
      }
      callPrinterCommand(callback -> printerService.printOriginalText(value, callback));
      promise.resolve(Boolean.TRUE);
    } catch (Exception e) {
      promise.reject("SUNMI_ORIGINAL_TEXT_ERROR", e.getMessage(), e);
    }
  }

  @ReactMethod
  public void printTextWithFont(String text, String typeface, float fontsize, Promise promise) {
    try {
      ensurePrinterReady();
      String value = normalizeText(text);
      if (value.isEmpty()) {
        promise.resolve(Boolean.FALSE);
        return;
      }
      String font = normalizeText(typeface);
      if (!font.isEmpty()) {
        callPrinterCommand(callback -> printerService.setFontName(font, callback));
      }
      callPrinterCommand(callback -> printerService.setFontSize(fontsize, callback));
      callPrinterCommand(callback -> printerService.printText(value, callback));
      promise.resolve(Boolean.TRUE);
    } catch (Exception e) {
      promise.reject("SUNMI_TEXT_FONT_ERROR", e.getMessage(), e);
    }
  }

  @ReactMethod
  public void printBarcode(String code, Promise promise) {
    String value = normalizeText(code);
    int symbology = value.matches("\\d{8}")
      ? 3
      : value.matches("\\d{13}")
        ? 2
        : 8;
    printBarCode(value, symbology, 120, 2, 2, promise);
  }

  @ReactMethod
  public void printBarCode(String data, int symbology, int height, int width, int textposition, Promise promise) {
    try {
      ensurePrinterReady();
      String value = normalizeBarcodeDataForSymbology(data, symbology);
      if (value.isEmpty()) {
        promise.resolve(Boolean.FALSE);
        return;
      }
      int safeHeight = Math.max(80, height);
      int safeWidth = Math.max(2, width);
      int safeTextPosition = Math.max(0, textposition);
      callPrinterCommand(callback -> printerService.printBarCode(
        value,
        symbology,
        safeHeight,
        safeWidth,
        safeTextPosition,
        callback
      ));
      promise.resolve(Boolean.TRUE);
    } catch (Exception e) {
      promise.reject("SUNMI_BARCODE_ERROR", e.getMessage(), e);
    }
  }

  @ReactMethod
  public void printQrCode(String text, Promise promise) {
    printQRCode(text, 4, 2, promise);
  }

  @ReactMethod
  public void printQRCode(String text, int modulesize, int errorlevel, Promise promise) {
    try {
      ensurePrinterReady();
      String value = normalizeText(text);
      if (value.isEmpty()) {
        promise.resolve(Boolean.FALSE);
        return;
      }
      callPrinterCommand(callback -> printerService.printQRCode(
        value,
        Math.max(1, modulesize),
        Math.max(0, Math.min(3, errorlevel)),
        callback
      ));
      promise.resolve(Boolean.TRUE);
    } catch (Exception e) {
      promise.reject("SUNMI_QR_ERROR", e.getMessage(), e);
    }
  }

  @ReactMethod
  public void printTestPage(Promise promise) {
    try {
      ensurePrinterReady();
      callPrinterCommand(callback -> printerService.printerInit(callback));
      callPrinterCommand(callback -> printerService.setAlignment(1, callback));
      callPrinterCommand(callback -> printerService.setFontSize(18f, callback));
      callPrinterCommand(callback -> printerService.printText("AlfaScan\n", callback));
      callPrinterCommand(callback -> printerService.printText("Prueba de impresora\n", callback));
      callPrinterCommand(callback -> printerService.lineWrap(1, callback));
      callPrinterCommand(callback -> printerService.printText("1234567890123\n", callback));
      callPrinterCommand(callback -> printerService.lineWrap(2, callback));
      promise.resolve(Boolean.TRUE);
    } catch (Exception e) {
      promise.reject("SUNMI_TEST_PRINT_ERROR", e.getMessage(), e);
    }
  }

  private void printTextInternal(String text, Promise promise) {
    try {
      ensurePrinterReady();
      String value = normalizeText(text);
      if (value.isEmpty()) {
        promise.resolve(Boolean.FALSE);
        return;
      }
      callPrinterCommand(callback -> printerService.printText(value, callback));
      promise.resolve(Boolean.TRUE);
    } catch (Exception e) {
      promise.reject("SUNMI_TEXT_ERROR", e.getMessage(), e);
    }
  }

  private WritableMap bindPrinterServiceInternal() {
    boolean innerPrinterVisible = isInnerPrinterAvailableInternal();

    synchronized (stateLock) {
      if (bound && printerService != null) {
        refreshPrinterMetadata();
        return buildPrinterInfoMap();
      }

      if (binding) {
        return buildPrinterInfoMap();
      }
      binding = true;
    }

    final Intent intent = createPrinterIntent();
    final CountDownLatch latch = new CountDownLatch(1);
    final AtomicReference<Exception> errorRef = new AtomicReference<>(null);

    try {
      reactContext.startService(intent);
    } catch (Exception e) {
      Log.i(TAG, "startService failed: " + e.getMessage());
    }

    boolean boundOk = reactContext.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE);
    if (!boundOk) {
      errorRef.set(new Exception("Error de bind."));
      synchronized (stateLock) {
        binding = false;
      }
      lastError = innerPrinterVisible ? "Error de bind." : "Servicio no encontrado.";
      return buildPrinterInfoMap();
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
        refreshPrinterMetadata();
      } catch (Exception e) {
        errorRef.set(e);
      } finally {
        synchronized (stateLock) {
          binding = false;
        }
      }
    }).start();

    try {
      latch.await(6, TimeUnit.SECONDS);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }

    Exception error = errorRef.get();
    if (error != null) {
      lastBindFailure(error);
    }
    return buildPrinterInfoMap();
  }

  private void ensurePrinterReady() throws Exception {
    if (printerService != null && bound) {
      return;
    }

    bindPrinterServiceInternal();
    if (printerService == null || !bound) {
      throw new Exception("Servicio no conectado.");
    }
  }

  private void lastBindFailure(Exception error) {
    Log.e(TAG, "bind printer failed", error);
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
      printerService = null;
      bound = false;
      binding = false;
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

  private WritableMap buildPrinterInfoMap() {
    WritableMap map = Arguments.createMap();
    boolean printerReady = bound && printerService != null;
    map.putBoolean("hasPrinter", printerReady);
    map.putBoolean("available", printerReady);
    map.putString("printerVersion", printerVersion);
    map.putString("printerModal", printerModal);
    map.putString("printerSerialNo", printerSerialNo);
    map.putString("serviceVersion", serviceVersion);
    map.putString("lastError", lastError);
    map.putString("mode", printerReady ? "NATIVE" : "UNAVAILABLE");
    return map;
  }

  private Intent createPrinterIntent() {
    Intent intent = new Intent();
    intent.setPackage(SUNMI_PACKAGE);
    intent.setAction(SUNMI_ACTION);
    return intent;
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

  private boolean isSunmiDeviceFromBuild() {
    String joined = (
      String.valueOf(android.os.Build.MANUFACTURER) + " " +
      String.valueOf(android.os.Build.BRAND) + " " +
      String.valueOf(android.os.Build.MODEL) + " " +
      String.valueOf(android.os.Build.DEVICE) + " " +
      String.valueOf(android.os.Build.PRODUCT)
    ).toLowerCase(Locale.ROOT);
    return joined.contains("sunmi");
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
      throw new Exception("Timeout en operacion Sunmi.");
    }

    String error = errorRef.get();
    if (error != null && !error.trim().isEmpty()) {
      throw new Exception(error);
    }

    Boolean success = successRef.get();
    if (success != null && !success) {
      throw new Exception("Operacion Sunmi fallida.");
    }
  }

  private String normalizeText(String value) {
    return String.valueOf(value == null ? "" : value).trim();
  }

  private String normalizeBarcodeDataForSymbology(String barcodeValue, int symbology) {
    String value = normalizeText(barcodeValue);
    if (value.isEmpty()) {
      return value;
    }
    if (symbology == 2 || symbology == 3) {
      return value.replaceAll("\\D", "");
    }
    return value;
  }

  private interface PrinterInvoker {
    void invoke(ICallback callback) throws Exception;
  }
}
