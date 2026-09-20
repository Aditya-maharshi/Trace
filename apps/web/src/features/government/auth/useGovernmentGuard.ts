import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export type GuardStatus = "loading" | "denied" | "ok";

function hasGovAccess(session: Session): boolean {
  return (
    session.user.app_metadata?.["government_access"] === true ||
    session.user.user_metadata?.["government_access"] === true
  );
}

export function useGovernmentGuard() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<GuardStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    async function checkAuthAndPerms() {
      // 1. Auth check
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!currentSession) {
        const hasAuthParams =
          typeof window !== "undefined" &&
          (window.location.hash.includes("access_token") || window.location.search.includes("code="));
        if (!hasAuthParams) {
          navigate({ to: "/government/login" as any, search: { redirect: "/government/dashboard" } as never });
        }
        return;
      }

      // 2. Permission check
      if (!hasGovAccess(currentSession)) {
        setStatus("denied");
        return;
      }

      // Authorized
      setSession(currentSession);
      setStatus("ok");
    }

    checkAuthAndPerms();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (currentSession) {
        if (!hasGovAccess(currentSession)) {
          setStatus("denied");
        } else {
          setSession(currentSession);
          setStatus("ok");
        }
      } else {
        navigate({ to: "/government/login" as any, search: { redirect: "/government/dashboard" } as never });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return { status, session };
}
