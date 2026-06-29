import { useEffect } from "react";
import { useCall } from "@/context/CallContext";
import { upsertCallThreadMessage } from "@/lib/optimisticMessages";
import { setCachedMessages } from "@/lib/messageCache";

/**
 * After a call ends, upsert the call bubble when provided and reload from server.
 */
export default function useRegisterCallThreadRefresh({
  loadMessages,
  setMessages,
  selectedIdRef,
  userIdRef,
}) {
  const { registerCallThreadRefresh } = useCall();

  useEffect(() => {
    if (!registerCallThreadRefresh) return undefined;

    registerCallThreadRefresh((convId, message) => {
      if (!convId) return;
      if (
        selectedIdRef?.current == null ||
        String(selectedIdRef.current) !== String(convId)
      ) {
        return;
      }

      if (message?.id && setMessages) {
        setMessages((prev) => {
          const next = upsertCallThreadMessage(prev, message);
          const uid = userIdRef?.current;
          if (uid) setCachedMessages(uid, convId, next);
          return next;
        });
      }

      void loadMessages?.(convId);
      window.setTimeout(() => {
        if (String(selectedIdRef?.current) === String(convId)) {
          void loadMessages?.(convId);
        }
      }, 1200);
    });

    return () => registerCallThreadRefresh(null);
  }, [registerCallThreadRefresh, loadMessages, setMessages, selectedIdRef, userIdRef]);
}
