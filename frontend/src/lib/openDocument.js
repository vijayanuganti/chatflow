import { openDocumentInNativeApp } from "@/lib/mediaHandler";
import { toast } from "sonner";

/**
 * Open a document with the OS default / chooser (Drive, Adobe, PDF viewer, Word, etc.).
 * @deprecated Import openDocumentInNativeApp from mediaHandler — kept for existing imports.
 */
export async function openDocumentExternally(pathOrUrl, fileName, mimeType) {
  await openDocumentInNativeApp(pathOrUrl, fileName, mimeType, (msg) => toast.error(msg));
}
