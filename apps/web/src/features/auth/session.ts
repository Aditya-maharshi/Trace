import { supabase } from "@/integrations/supabase/client";

export const GUEST_SESSION_KEY = "trace_guest_session";
export const DEMO_PROVIDER_KEY = "trace_demo_provider";

export function getGuestSession() {
  const isGuest = localStorage.getItem(GUEST_SESSION_KEY);
  const provider = localStorage.getItem(DEMO_PROVIDER_KEY);
  return { isGuest: !!isGuest, provider };
}

export function setGuestSession(provider?: string) {
  localStorage.setItem(GUEST_SESSION_KEY, "true");
  if (provider) {
    localStorage.setItem(DEMO_PROVIDER_KEY, provider);
  }
}

export function clearGuestSession() {
  localStorage.removeItem(GUEST_SESSION_KEY);
  localStorage.removeItem(DEMO_PROVIDER_KEY);
}

export async function signOutEverywhere() {
  clearGuestSession();
  await supabase.auth.signOut();
}
