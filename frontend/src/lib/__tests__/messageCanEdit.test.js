import { messageCanEdit } from "../messageCanEdit";

describe("messageCanEdit", () => {
  test("allows own text messages only", () => {
    expect(
      messageCanEdit({ id: "1", sender_id: "u1", message_type: "text" }, "u1"),
    ).toBe(true);
    expect(
      messageCanEdit({ id: "1", sender_id: "u2", message_type: "text" }, "u1"),
    ).toBe(false);
    expect(
      messageCanEdit({ id: "1", sender_id: "u1", message_type: "image" }, "u1"),
    ).toBe(false);
    expect(messageCanEdit(null, "u1")).toBe(false);
  });
});
