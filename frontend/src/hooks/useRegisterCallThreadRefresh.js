import { useEffect } from "react";
import { useCall } from "@/context/CallContext";

/**
 * After a call ends, reload the open thread from the server (single source of truth).
 */
export default function useRegisterCallThreadRefresh({
  loadMessages,
  selectedIdRef,
}) {
  const { registerCallThreadRefresh } = useCall();

  useEffect(() => {
    if (!registerCallThreadRefresh) return undefined;

    registerCallThreadRefresh((convId) => {
      if (!convId) return;
      if (
        selectedIdRef?.current != null &&
        String(selectedIdRef.current) === String(convId)
      ) {
        void loadMessages?.(convId);
      }
    });

    return () => registerCallThreadRefresh(null);
  }, [registerCallThreadRefresh, loadMessages, selectedIdRef]);
}
