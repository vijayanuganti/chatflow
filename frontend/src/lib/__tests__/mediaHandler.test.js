function guessMimeType(fileName, mimeType, mediaKind) {
  if (mimeType) return mimeType;
  const n = (fileName || "").toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".mp4")) return "video/mp4";
  if (mediaKind === "video") return "video/*";
  return "application/octet-stream";
}

function safeMediaFileName(name, fallback = "file") {
  const base = (name || fallback).replace(/[/\\?%*:|"<>]/g, "_").trim() || fallback;
  return base.slice(0, 120);
}

describe("mediaHandler helpers", () => {
  test("guessMimeType for video and pdf", () => {
    expect(guessMimeType("clip.mp4", null, "video")).toBe("video/mp4");
    expect(guessMimeType("doc.pdf", null, "document")).toBe("application/pdf");
  });

  test("safeMediaFileName sanitizes", () => {
    expect(safeMediaFileName("bad/name?.pdf")).toBe("bad_name_.pdf");
  });
});
