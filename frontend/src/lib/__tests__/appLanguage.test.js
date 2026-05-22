jest.mock("@/i18n", () => ({
  __esModule: true,
  default: { changeLanguage: jest.fn(() => Promise.resolve()) },
}));

import {
  normalizeLanguage,
  languageDisplayCode,
  SUPPORTED_LANGUAGES,
} from "../appLanguage";

describe("appLanguage", () => {
  test("normalizeLanguage accepts supported codes", () => {
    expect(SUPPORTED_LANGUAGES).toEqual(["en", "hi", "te"]);
    expect(normalizeLanguage("hi")).toBe("hi");
    expect(normalizeLanguage(" TE ")).toBe("te");
  });

  test("normalizeLanguage falls back to en", () => {
    expect(normalizeLanguage("fr")).toBe("en");
    expect(normalizeLanguage("")).toBe("en");
    expect(normalizeLanguage(null)).toBe("en");
  });

  test("languageDisplayCode", () => {
    expect(languageDisplayCode("hi")).toBe("HI");
    expect(languageDisplayCode("xx")).toBe("EN");
  });
});
