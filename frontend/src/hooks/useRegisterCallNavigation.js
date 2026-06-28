import { useEffect } from "react";
import { useCall } from "@/context/CallContext";

export default function useRegisterCallNavigation(openConversationById) {
  const { registerNavigateToConversation } = useCall();

  useEffect(() => {
    registerNavigateToConversation(openConversationById);
    return () => registerNavigateToConversation(null);
  }, [openConversationById, registerNavigateToConversation]);
}
