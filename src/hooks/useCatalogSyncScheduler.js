import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import Configuration from "@db/Configuration";
import { syncCatalogToLocal } from "@services/catalogService";
import { isSqlConnectorAvailable } from "@services/sqlClient";

const FREQUENCY_TO_MS = {
  EVERY_1_HOUR: 60 * 60 * 1000,
  EVERY_2_HOURS: 2 * 60 * 60 * 1000,
  EVERY_3_HOURS: 3 * 60 * 60 * 1000,
};

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const getSyncWindowMs = (frequency) => FREQUENCY_TO_MS[normalize(frequency)] || 0;

const shouldSyncForFrequency = ({ frequency, lastSyncAt, isStartup }) => {
  const normalizedFrequency = normalize(frequency);
  if (normalizedFrequency === "MANUAL") {
    return false;
  }

  if (normalizedFrequency === "ON_START") {
    return isStartup;
  }

  const syncWindowMs = getSyncWindowMs(normalizedFrequency);
  if (!syncWindowMs) {
    return false;
  }

  if (!lastSyncAt) {
    return true;
  }

  const lastDate = new Date(lastSyncAt);
  if (Number.isNaN(lastDate.getTime())) {
    return true;
  }

  return Date.now() - lastDate.getTime() >= syncWindowMs;
};

export default function useCatalogSyncScheduler() {
  const runningRef = useRef(false);
  const startupSyncDoneRef = useRef(false);
  const syncTimerRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    const runSyncIfNeeded = async ({ isStartup = false } = {}) => {
      if (runningRef.current) {
        return;
      }

      runningRef.current = true;
      try {
        await Configuration.createTable();
        const [connectionType, syncFrequency, lastSyncAt] = await Promise.all([
          Configuration.getConfigValue("CONNECTION_TYPE"),
          Configuration.getConfigValue("SYNC_FREQUENCY"),
          Configuration.getConfigValue("LAST_SYNC_AT"),
        ]);

        const mode = normalize(connectionType || "LOCAL");
        if (mode !== "LOCAL") {
          return;
        }

        const frequency = normalize(syncFrequency || "MANUAL");
        const shouldSync = shouldSyncForFrequency({
          frequency,
          lastSyncAt,
          isStartup,
        });

        if (!shouldSync) {
          return;
        }

        if (!isSqlConnectorAvailable()) {
          return;
        }

        const result = await syncCatalogToLocal();
        if (!mounted) {
          return;
        }

        const now = new Date().toISOString();
        await Configuration.setConfigValue("LAST_SYNC_AT", now);
        if (result?.inserted !== undefined) {
          // Keep the scheduler silent. Screens surface the status to the user.
          // eslint-disable-next-line no-console
          console.info("[sync] catalog updated", {
            inserted: result.inserted,
            mode: result.mode,
          });
        }
      } catch (error) {
        // Keep auto-sync failures non-blocking; the dedicated sync screen reports the error on demand.
        // eslint-disable-next-line no-console
        console.warn("[sync] auto sync skipped", error?.message || error);
      } finally {
        runningRef.current = false;
      }
    };

    const handleAppStateChange = (nextState) => {
      if (nextState === "active") {
        runSyncIfNeeded({ isStartup: !startupSyncDoneRef.current });
        startupSyncDoneRef.current = true;
      }
    };

    runSyncIfNeeded({ isStartup: true });
    startupSyncDoneRef.current = true;

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    syncTimerRef.current = setInterval(() => {
      runSyncIfNeeded({ isStartup: false });
    }, 60 * 1000);

    return () => {
      mounted = false;
      subscription.remove();
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
      }
    };
  }, []);
}
