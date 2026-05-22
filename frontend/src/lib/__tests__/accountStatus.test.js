import {
  getClientStatus,
  isActiveEmployee,
  isInactiveEmployee,
  filterUserForTab,
  filterBatchForTab,
} from "../accountStatus";

describe("accountStatus", () => {
  test("getClientStatus", () => {
    expect(getClientStatus({ role: "employee" })).toBeNull();
    expect(getClientStatus({ role: "client", client_status: "dropped" })).toBe("dropped");
    expect(getClientStatus({ role: "client", is_active: false })).toBe("inactive");
    expect(getClientStatus({ role: "client" })).toBe("active");
  });

  test("employee active flags", () => {
    expect(isActiveEmployee({ role: "employee", is_active: true })).toBe(true);
    expect(isInactiveEmployee({ role: "employee", is_active: false })).toBe(true);
  });

  test("filterUserForTab", () => {
    const activeEmp = { role: "employee", is_active: true };
    const dropped = { role: "client", client_status: "dropped" };
    expect(filterUserForTab(activeEmp, "active_employees")).toBe(true);
    expect(filterUserForTab(dropped, "dropped_clients")).toBe(true);
    expect(filterUserForTab(dropped, "active_clients")).toBe(false);
  });

  test("filterBatchForTab", () => {
    expect(filterBatchForTab({ status: "inactive" }, "inactive")).toBe(true);
    expect(filterBatchForTab({ status: "active" }, "dropped")).toBe(false);
  });
});
