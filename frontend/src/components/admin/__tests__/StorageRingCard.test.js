import { formatStorageBytes } from "../StorageRingCard";

function usageLevel(percent) {
  if (percent == null || Number.isNaN(percent)) return "normal";
  if (percent >= 90) return "critical";
  if (percent >= 75) return "warning";
  return "normal";
}

describe("StorageRingCard helpers", () => {
  test("formatStorageBytes", () => {
    expect(formatStorageBytes(500)).toBe("500 B");
    expect(formatStorageBytes(2048)).toBe("2 KB");
    expect(formatStorageBytes(null)).toBe("—");
  });

  test("usageLevel thresholds 75% amber, 90% red", () => {
    expect(usageLevel(50)).toBe("normal");
    expect(usageLevel(75)).toBe("warning");
    expect(usageLevel(89.9)).toBe("warning");
    expect(usageLevel(90)).toBe("critical");
    expect(usageLevel(100)).toBe("critical");
  });
});
