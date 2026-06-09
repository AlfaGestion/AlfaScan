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
  public void printSimpleProductLabel(String formatKey, String description, String price, String barcode, String internalCode, Promise promise) {
    if (printerService == null || !bound) {
      promise.reject("SERVICE_NOT_CONNECTED", "Servicio no conectado.");
      return;
    }

    try {
      printSimpleProductLabelInternal(printerService, formatKey, description, price, barcode, internalCode);
      promise.resolve(Boolean.TRUE);
    } catch (Exception e) {
      lastError = e.getMessage();
      promise.reject("PRINT_ERROR", e.getMessage(), e);
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
      "Prueba de impresión",
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

  private void printSimpleProductLabelInternal(IWoyouService service, String formatKey, String description, String price, String barcode, String internalCode) throws Exception {
    String desc = String.valueOf(description == null ? "" : description).trim();
    String priceText = String.valueOf(price == null ? "" : price).trim();
    String internalText = String.valueOf(internalCode == null ? "" : internalCode).trim();

    Log.i(TAG, "[SUNMI] printSimpleProductLabel start");
    callPrinterCommand(callback -> service.printerInit(callback));
    Log.i(TAG, "[SUNMI] print title");
    callPrinterCommand(callback -> service.setAlignment(1, callback));
    callPrinterCommand(callback -> service.printText("AlfaScan\n\n", callback));
    callPrinterCommand(callback -> service.lineWrap(1, callback));

    Log.i(TAG, "[SUNMI] print description");
    callPrinterCommand(callback -> service.setAlignment(0, callback));
    callPrinterCommand(callback -> service.printText((desc.isEmpty() ? "Producto" : desc) + "\n\n", callback));
    callPrinterCommand(callback -> service.lineWrap(1, callback));

    Log.i(TAG, "[SUNMI] print price");
    callPrinterCommand(callback -> service.setAlignment(1, callback));
    callPrinterCommand(callback -> service.printText((priceText.isEmpty() ? "$ 0,00" : priceText) + "\n\n", callback));
    callPrinterCommand(callback -> service.lineWrap(1, callback));

    Log.i(TAG, "[SUNMI] print code");
    callPrinterCommand(callback -> service.setAlignment(0, callback));
    callPrinterCommand(callback -> service.printText("Cod: " + (internalText.isEmpty() ? "-" : internalText) + "\n\n", callback));
    callPrinterCommand(callback -> service.lineWrap(2, callback));
    Log.i(TAG, "[SUNMI] print done");
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
