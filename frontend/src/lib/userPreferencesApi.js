import { api } from "@/lib/api";

export async function patchUserPreferences(body) {
  const res = await api.patch("/users/me/preferences", body);
  return res.data;
}
