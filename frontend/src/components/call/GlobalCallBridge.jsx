import { useAuth } from "@/context/AuthContext";
import useGlobalCallListener from "@/hooks/useGlobalCallListener";

export default function GlobalCallBridge() {
  const { user } = useAuth();
  useGlobalCallListener(user?.id);
  return null;
}
