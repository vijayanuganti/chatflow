import React from "react";
import { useAuth } from "@/context/AuthContext";
import ChatApp from "@/pages/ChatApp";
import ClientHome from "@/pages/ClientHome";

export default function ChatIndexRoute() {
  const { user } = useAuth();
  if ((user?.role || "").toLowerCase() === "client") {
    return <ClientHome />;
  }
  return <ChatApp />;
}
