import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getGuestSession } from "@/features/auth/session";

export function useCommercialGuard() {
  const navigate = useNavigate();
  const [checkedAuth, setCheckedAuth] = useState(false);

  useEffect(() => {
    if (getGuestSession().isGuest) {
      setCheckedAuth(true);
      return;
    }

    supabase.auth.getSession().then((res) => {
      if (res.data.session) {
        setCheckedAuth(true);
      } else {
        const hasAuthParams =
          typeof window !== "undefined" &&
          (window.location.hash.includes("access_token") ||
            window.location.search.includes("code="));
        if (!hasAuthParams) {
          navigate({ to: "/commercial/login", search: { redirect: "/commercial/dashboard" } as never });
        }
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setCheckedAuth(true);
      } else if (!getGuestSession().isGuest) {
        navigate({ to: "/commercial/login", search: { redirect: "/commercial/dashboard" } as never });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return { checkedAuth };
}
