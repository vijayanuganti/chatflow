import { useCallback } from "react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { lastMessageFieldsFromMsg } from "@/lib/chatListPreview";
import { getCachedMessages, setCachedMessages } from "@/lib/messageCache";
import {
  makeOptimisticMessageId,
  mergeSentMessageResponse,
  appendToMessageList,
  isViewingConversation,
  createOptimisticTimestamp,
  ensureMessageTimestamp,
  sortMessagesChronologically,
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
  const commitMessages = useCallback((conversationId, updater) => {
    setMessages((prev) => {
      const raw = typeof updater === "function" ? updater(prev) : updater;
      if (!Array.isArray(raw)) return prev;
      const next = sortMessagesChronologically(raw);
      if (user?.id && conversationId && isViewingConversation(conversationId, selectedIdRef.current)) {
        setCachedMessages(user.id, conversationId, next);
      }
      return next;
    });
  }, [user?.id, selectedIdRef, setMessages]);

  const patchMessage = useCallback((tempId, patch) => {
    commitMessages(selectedIdRef.current, (prev) => (
      prev.map((m) => (m.__tempId === tempId ? { ...m, ...patch } : m))
    ));
  }, [commitMessages, selectedIdRef]);

  const applyServerMessage = useCallback((tempId, serverMessage, conversationId) => {
    if (!conversationId) return;
    commitMessages(conversationId, (prev) => (
      mergeSentMessageResponse(prev, tempId, serverMessage)
    ));
  }, [commitMessages]);

  const sendMessage = useCallback((body, options = {}) => {
    const {
      deferPost = false,
      tempId: existingTempId,
      skipOptimistic = false,
      extraFields = {},
    } = options;

    const tempId = existingTempId || makeOptimisticMessageId();
    const nowIso = createOptimisticTimestamp();
    const convId = body.conversation_id;
    const conv = conversations?.find((c) => c.id === convId);

    const updateConversationPreview = (previewSource, createdAt) => {
      if (!setConversations || !convId) return;
      setConversations((prev) => {
        let found = false;
        const updated = prev.map((c) => {
          if (c.id === convId) {
            found = true;
            return {
              ...c,
              ...lastMessageFieldsFromMsg(
                { ...previewSource, created_at: createdAt || previewSource.created_at },
                c,
                user?.id,
              ),
            };
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
          const res = await api.post("/messages", { ...body, client_message_id: tempId });
          applyServerMessage(tempId, res.data, convId);
          updateConversationPreview(res.data, res.data.created_at);
        } catch (err) {
          toast.error(formatApiError(err));
          commitMessages(convId, (prev) => prev.map((m) => (
            m.__tempId === tempId
              ? { ...m, __pending: false, __error: true, __uploadProgress: undefined }
              : m
          )));
        }
      })();
      return tempId;
    }

    if (!skipOptimistic && existingTempId) {
      commitMessages(convId, (prev) => prev.map((m) => (
        String(m.__tempId) === String(tempId) || String(m.id) === String(tempId)
          ? {
            ...m,
            __pending: true,
            __error: false,
            __uploadProgress: undefined,
            content: body.content ?? m.content,
            message_type: body.message_type ?? m.message_type,
            file_url: body.file_url ?? m.file_url,
            file_name: body.file_name ?? m.file_name,
            ...extraFields,
          }
          : m
      )));
    } else if (!skipOptimistic && !existingTempId) {
      const recipientIds = conv
        ? (conv.participants || []).filter((p) => p !== user?.id)
        : [];
      const optimistic = ensureMessageTimestamp({
        id: tempId,
        __tempId: tempId,
        __pending: true,
        conversation_id: convId,
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
        reply_to_id: body.reply_to_id,
        reply_to_snippet: body.reply_to_snippet,
        reply_to_sender: body.reply_to_sender,
        ...extraFields,
      });

      if (convId) {
        commitMessages(convId, (prev) => appendToMessageList(prev, optimistic));
        if (user?.id && !isViewingConversation(convId, selectedIdRef.current)) {
          const cached = getCachedMessages(convId) || [];
          setCachedMessages(user.id, convId, appendToMessageList(cached, optimistic));
        }
      }

      updateConversationPreview(optimistic, nowIso);
    }

    if (deferPost) return tempId;

    const postBody = {
      ...body,
      client_message_id: tempId,
    };

    (async () => {
      try {
        const res = await api.post("/messages", postBody);
        applyServerMessage(tempId, res.data, convId);
        updateConversationPreview(res.data, res.data.created_at);
      } catch (err) {
        toast.error(formatApiError(err));
        commitMessages(convId, (prev) => prev.map((m) => (
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
    setConversations,
    onConversationMissing,
    applyServerMessage,
    commitMessages,
  ]);

  return { sendMessage, patchMessage };
}
