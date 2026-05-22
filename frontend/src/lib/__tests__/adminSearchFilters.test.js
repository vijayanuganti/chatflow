import {
  matchesUserSearch,
  matchesFolderSearch,
  matchesEmployeeSearch,
} from "../adminSearchFilters";

describe("adminSearchFilters", () => {
  const user = {
    full_name: "Jane Doe",
    username: "jane",
    id: "user-42",
    phone_number: "+919876543210",
    email: "jane@example.com",
  };

  test("matchesUserSearch by name, id, phone, email", () => {
    expect(matchesUserSearch(user, "")).toBe(true);
    expect(matchesUserSearch(user, "jane")).toBe(true);
    expect(matchesUserSearch(user, "user-42")).toBe(true);
    expect(matchesUserSearch(user, "987654")).toBe(true);
    expect(matchesUserSearch(user, "example.com")).toBe(true);
    expect(matchesUserSearch(user, "nomatch")).toBe(false);
  });

  test("matchesFolderSearch", () => {
    expect(matchesFolderSearch({ name: "Workouts" }, "work")).toBe(true);
    expect(matchesFolderSearch({ name: "Workouts" }, "diet")).toBe(false);
  });

  test("matchesEmployeeSearch", () => {
    expect(matchesEmployeeSearch({ full_name: "Bob", id: "e1" }, "bob")).toBe(true);
    expect(matchesEmployeeSearch({ full_name: "Bob", id: "e1" }, "zzz")).toBe(false);
  });
});
