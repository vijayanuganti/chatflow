import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import MobilePageShell from "@/components/layout/MobilePageShell";
import DietPlanContent from "@/components/diet/DietPlanContent";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useNavigateBack } from "@/hooks/useNavigateBack";

export default function DietPlanPage() {
  const { clientId: chatClientId, userId: adminClientId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user: me } = useAuth();

  const backTo = location.state?.backTo ?? "/chat";
  const pendingChat = location.state?.pendingChat;

  const handleBack = useNavigateBack({ backTo, pendingChat });
  const resolvedClientId =
    adminClientId || chatClientId || (me?.role === "client" ? me.id : null);

  const [client, setClient] = useState(() => {
    const fromState = location.state?.client;
    if (fromState?.id) return fromState;
    if (me?.role === "client" && !chatClientId && !adminClientId) {
      return { id: me.id, full_name: me.full_name };
    }
    return null;
  });

  const isClientViewer = me?.role === "client";

  useEffect(() => {
    if (client?.id) return;
    if (!resolvedClientId) {
      navigate(backTo, { replace: true });
      return;
    }
    if (me?.role === "client" && me.id === resolvedClientId) {
      setClient({ id: me.id, full_name: me.full_name });
      return;
    }
    let cancelled = false;
    api
      .get(`/admin/users/${resolvedClientId}`)
      .then((res) => {
        if (!cancelled) setClient(res.data?.user || res.data);
      })
      .catch(() => {
        if (!cancelled) {
          setClient({ id: resolvedClientId, full_name: "Client" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client?.id, resolvedClientId, me, navigate, backTo]);

  const description = isClientViewer
    ? "Your nutritionist's plan for each day. Upload a photo of what you actually ate to log it."
    : "Suggest morning, afternoon and night meals. The client uploads photos as they complete each one.";

  return (
    <MobilePageShell
      title={client ? `Diet plan | ${client.full_name}` : "Diet plan"}
      description={description}
      onBack={handleBack}
      testId="diet-plan-page"
    >
      {client?.id ? (
        <DietPlanContent
          client={client}
          startFromDayOne={!!location.state?.startFromDayOne}
        />
      ) : (
        <div className="py-12 text-center text-sm text-gray-400">Loading client...</div>
      )}
    </MobilePageShell>
  );
}
