import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getConfig } from "@/lib/api";
import { CommercialConsole } from "./CommercialConsole";
import { useCommercialGuard } from "@/features/commercial/auth/useCommercialGuard";
import { getGuestSession } from "@/features/auth/session";

export function CommercialDashboardPage({ initialPage }: { initialPage?: any }) {
  const { checkedAuth } = useCommercialGuard();
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    getConfig().then((c) => setIsDemoMode(c.isDemoMode)).catch(console.error);
    const guestSession = getGuestSession();
    if (guestSession.isGuest) {
      setUserEmail(guestSession.provider ? `${guestSession.provider} demo analyst` : "guest analyst");
    } else {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user?.email) setUserEmail(user.email);
      });
    }
  }, []);

  if (!checkedAuth) {
    return (
      <div className="min-h-screen bg-[#06060a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 rounded-full border-2 border-orange-500/40 border-t-orange-400 animate-spin" />
          <p className="text-white/40 text-sm">Authenticating…</p>
        </div>
      </div>
    );
  }

  return <CommercialConsole userEmail={userEmail} isDemoMode={isDemoMode} initialPage={initialPage} />;
}
