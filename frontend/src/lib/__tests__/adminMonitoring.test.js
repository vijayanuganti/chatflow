import {
  conversationIncludesAdmin,
  filterMonitoringConversations,
  adminCanChatWithUser,
  filterAdminMyChatConversations,
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
});
