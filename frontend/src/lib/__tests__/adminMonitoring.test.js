import {
  conversationIncludesAdmin,
  filterMonitoringConversations,
  adminCanChatWithUser,
  filterAdminMyChatConversations,
  monitoringBubbleAlignRight,
} from "../adminMonitoring";

describe("adminMonitoring", () => {
  test("conversationIncludesAdmin", () => {
    expect(
      conversationIncludesAdmin({
        participants_info: [{ role: "employee" }, { role: "client" }],
      }),
    ).toBe(false);
    expect(
      conversationIncludesAdmin({
        participants_info: [{ role: "admin" }, { role: "client" }],
      }),
    ).toBe(true);
  });

  test("filterMonitoringConversations", () => {
    const list = [
      { id: "1", participants_info: [{ role: "employee" }, { role: "client" }] },
      { id: "2", participants_info: [{ role: "admin" }, { role: "employee" }] },
    ];
    expect(filterMonitoringConversations(list).map((c) => c.id)).toEqual(["1"]);
  });

  test("adminCanChatWithUser blocks clients", () => {
    expect(adminCanChatWithUser({ role: "client" })).toBe(false);
    expect(adminCanChatWithUser({ role: "employee" })).toBe(true);
  });

  test("filterAdminMyChatConversations", () => {
    const list = [
      { id: "a", type: "direct", other_user: { role: "client" } },
      { id: "b", type: "direct", other_user: { role: "employee" } },
    ];
    expect(filterAdminMyChatConversations(list).map((c) => c.id)).toEqual(["b"]);
  });

  test("monitoringBubbleAlignRight client left employee right", () => {
    const conv = {
      participants_info: [
        { id: "emp1", role: "employee" },
        { id: "cli1", role: "client" },
      ],
    };
    expect(monitoringBubbleAlignRight({ sender_id: "cli1" }, conv)).toBe(false);
    expect(monitoringBubbleAlignRight({ sender_id: "emp1" }, conv)).toBe(true);
  });

  test("monitoringBubbleAlignRight two employees", () => {
    const conv = {
      participants_info: [
        { id: "e1", role: "employee" },
        { id: "e2", role: "employee" },
      ],
    };
    expect(monitoringBubbleAlignRight({ sender_id: "e1" }, conv)).toBe(false);
    expect(monitoringBubbleAlignRight({ sender_id: "e2" }, conv)).toBe(true);
  });
});
