/** ASCII-safe placeholders for loading / empty UI (avoids mojibake in WebViews). */
export const EMPTY_DISPLAY = "-";

export function displayStat(value) {
  if (value === null || value === undefined || value === "") return EMPTY_DISPLAY;
  return value;
}

export function displayLoadingStat(loaded, value) {
  if (!loaded) return EMPTY_DISPLAY;
  if (value === null || value === undefined || value === "") return "0";
  return value;
}
