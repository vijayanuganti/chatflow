import {
  isOwnMessage,
  shouldNotifyForMessage,
  isViewingConversation,
  sortMessagesChronologically,
  isOptimisticMessageId,
} from "../optimisticMessages";

describe("optimisticMessages", () => {
  test("isOwnMessage and shouldNotifyForMessage", () => {
    const m = { sender_id: "u1" };
    expect(isOwnMessage(m, "u1")).toBe(true);
    expect(shouldNotifyForMessage(m, "u1")).toBe(false);
    expect(shouldNotifyForMessage(m, "u2")).toBe(true);
  });

  test("isViewingConversation", () => {
    expect(isViewingConversation("c1", "c1")).toBe(true);
    expect(isViewingConversation("c1", "c2")).toBe(false);
  });

  test("sortMessagesChronologically keeps order", () => {
    const list = [
      { id: "b", created_at: "2024-01-02T00:00:00Z" },
      { id: "a", created_at: "2024-01-01T00:00:00Z" },
    ];
    const sorted = sortMessagesChronologically(list);
    expect(sorted[0].id).toBe("a");
    expect(sorted[1].id).toBe("b");
  });

  test("isOptimisticMessageId", () => {
    expect(isOptimisticMessageId("temp-123")).toBe(true);
    expect(isOptimisticMessageId("msg-1")).toBe(false);
  });
});
