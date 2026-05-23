import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import ShareDestinationSheet from "@/components/share/ShareDestinationSheet";
import {
  addShareReceivedListener,
  clearPendingNativeShares,
  fetchPendingNativeShares,
  isShareIntentSupported,
  prepareSharePayload,
} from "@/lib/shareIntent/nativeShare";
import { toast } from "sonner";

/**
 * Handles native share intents: queue when logged out, show picker when logged in.
 */
export default function ShareIntentProvider({ children }) {
  const { user, loading } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [texts, setTexts] = useState([]);
  const processingRef = useRef(false);

  const openPicker = useCallback((payloadFiles, payloadTexts) => {
    setFiles(payloadFiles);
    setTexts(payloadTexts);
    setSheetOpen(true);
  }, []);

  const processNativeItems = useCallback(async () => {
    if (!isShareIntentSupported() || processingRef.current) return;
    processingRef.current = true;
    try {
      const items = await fetchPendingNativeShares();
      if (!items.length) return;

      const prepared = await prepareSharePayload(items);

      if (!prepared.ok) {
        await clearPendingNativeShares();
        toast.error(prepared.error);
        return;
      }

      if (!user?.id) {
        toast.info("Sign in to finish sharing.");
        return;
      }

      await clearPendingNativeShares();
      openPicker(prepared.files, prepared.texts);
    } catch (err) {
      console.warn("[shareIntent] process failed:", err);
      toast.error("Could not open shared content.");
    } finally {
      processingRef.current = false;
    }
  }, [user?.id, openPicker]);

  useEffect(() => {
    if (!isShareIntentSupported()) return undefined;
    let removeListener = () => {};
    void addShareReceivedListener(() => {
      void processNativeItems();
    }).then((fn) => {
      removeListener = fn;
    });
    return () => removeListener();
  }, [processNativeItems]);

  useEffect(() => {
    if (loading) return;
    void processNativeItems();
  }, [loading, processNativeItems]);

  const handleComplete = useCallback(() => {
    setFiles([]);
    setTexts([]);
    void clearPendingNativeShares();
  }, []);

  const handleCancel = useCallback(() => {
    setFiles([]);
    setTexts([]);
    void clearPendingNativeShares();
  }, []);

  return (
    <>
      {children}
      <ShareDestinationSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        user={user}
        files={files}
        texts={texts}
        onComplete={handleComplete}
        onCancel={handleCancel}
      />
    </>
  );
}
