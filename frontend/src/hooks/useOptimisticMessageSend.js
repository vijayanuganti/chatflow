import { useCallback } from "react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { setCachedMessages } from "@/lib/messageCache";
import {
  makeOptimisticMessageId,
  mergeSentMessageResponse,
} from "@/lib/optimisticMessages";

/**
 * Shared optimistic send + patch for ChatApp and AdminDashboard.
 */
export function useOptimisticMessageSend({
  user,
  selectedIdRef,
  setMessages,
  setConversations,
  conversations,
  onConversationMissing,
}) {
  const patchMessage = useCallback((tempId, patch) => {
    setMessages((prev) => {
      const next = prev.map((m) => (m.__tempId === tempId ? { ...m, ...patch } : m));
      if (user?.id && selectedIdRef.current) {
        const convId = next.find((m) => m.__tempId === tempId)?.conversation_id;
        if (convId) setCachedMessages(user.id, convId, next);
      }
      return next;
    });
  }, [user?.id, selectedIdRef, setMessages]);

  const applyServerMessage = useCallback((tempId, serverMessage, conversationId) => {
    setMessages((prev) => {
      const next = mergeSentMessageResponse(prev, tempId, serverMessage);
      if (user?.id && selectedIdRef.current === conversationId) {
        setCachedMessages(user.id, conversationId, next);
      }
      return next;
    });
  }, [user?.id, selectedIdRef, setMessages]);

  const sendMessage = useCallback((body, options = {}) => {
    const {
      deferPost = false,
      tempId: existingTempId,
      skipOptimistic = false,
      extraFields = {},
    } = options;

    const tempId = existingTempId || makeOptimisticMessageId();
    const nowIso = new Date().toISOString();
    const conv = conversations?.find((c) => c.id === body.conversation_id);

    const updateConversationPreview = (previewSource, createdAt) => {
      if (!setConversations) return;
      const preview = previewSource.content || `[${previewSource.message_type}]`;
      const previewText = conv?.type === "group"
        ? `${previewSource.sender_name}: ${preview}`
        : preview;
      setConversations((prev) => {
        let found = false;
        const updated = prev.map((c) => {
          if (c.id === body.conversation_id) {
            found = true;
            return { ...c, last_message: previewText, last_message_at: createdAt };
          }
          return c;
        });
        if (!found) {
          onConversationMissing?.();
          return prev;
        }
        updated.sort((a, b) => (b.last_message_at || "").localeCompare(a.last_message_at || ""));
        return updated;
      });
    };

    if (skipOptimistic && existingTempId) {
      (async () => {
        try {
          const res = await api.post("/messages", body);
          applyServerMessage(tempId, res.data, body.conversation_id);
          updateConversationPreview(res.data, res.data.created_at);
        } catch (err) {
          toast.error(formatApiError(err));
          setMessages((prev) => prev.map((m) => (
            m.__tempId === tempId
              ? { ...m, __pending: false, __error: true, __uploadProgress: undefined }
              : m
          )));
        }
      })();
      return tempId;
    }

    if (!skipOptimistic && !existingTempId) {
      const recipientIds = conv
        ? (conv.participants || []).filter((p) => p !== user?.id)
        : [];
      const optimistic = {
        id: tempId,
        __tempId: tempId,
        __pending: true,
        conversation_id: body.conversation_id,
        conversation_type: conv?.type,
        sender_id: user?.id,
        sender_name: user?.full_name,
        content: body.content || "",
        message_type: body.message_type,
        file_url: body.file_url,
        file_name: body.file_name,
        file_size: body.file_size,
        created_at: nowIso,
        read_by: [user?.id],
        recipient_ids: recipientIds,
        status: "sent",
        ...extraFields,
      };

      if (selectedIdRef.current === body.conversation_id) {
        setMessages((prev) => {
          const next = [...prev, optimistic];
          if (user?.id) setCachedMessages(user.id, body.conversation_id, next);
          return next;
        });
      }

      updateConversationPreview(optimistic, nowIso);
    }

    if (deferPost) return tempId;

    (async () => {
      try {
        const res = await api.post("/messages", body);
        applyServerMessage(tempId, res.data, body.conversation_id);
        updateConversationPreview(res.data, res.data.created_at);
      } catch (err) {
        toast.error(formatApiError(err));
        setMessages((prev) => prev.map((m) => (
          m.__tempId === tempId
            ? { ...m, __pending: false, __error: true, __uploadProgress: undefined }
            : m
        )));
      }
    })();

    return tempId;
  }, [
    user?.id,
    user?.full_name,
    conversations,
    selectedIdRef,
    setMessages,
    setConversations,
    onConversationMissing,
    applyServerMessage,
  ]);

  return { sendMessage, patchMessage };
}
