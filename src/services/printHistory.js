import AsyncStorage from "@react-native-async-storage/async-storage";

const PRINT_HISTORY_KEY = "@alfascan.printHistory";
const MAX_ITEMS = 30;

export const loadPrintHistory = async () => {
  const raw = await AsyncStorage.getItem(PRINT_HISTORY_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

export const appendPrintHistory = async (entry) => {
  const current = await loadPrintHistory();
  const next = [
    {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    },
    ...current,
  ].slice(0, MAX_ITEMS);

  await AsyncStorage.setItem(PRINT_HISTORY_KEY, JSON.stringify(next));
  return next;
};

export const clearPrintHistory = async () => {
  await AsyncStorage.removeItem(PRINT_HISTORY_KEY);
};
