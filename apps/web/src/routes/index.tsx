import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Trace — Choose your workspace" },
      {
        name: "description",
        content: "Trace automated attribution engine gateway.",
      },
    ],
  }),
  component: Gateway,
});

function Gateway() {
  const navigate = useNavigate();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      // Allow demo users to bypass auto-routing if they want to click around,
      // but if we are rigorously enforcing this rule:
      if (localStorage.getItem("trace_guest_session")) {
        // Guest session is commercial-only by default in the mock
        navigate({ to: "/dashboard" });
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        const hasGovAccess = session.user.app_metadata?.government_access === true || 
                             session.user.user_metadata?.government_access === true;
        
        if (!hasGovAccess) {
          // Commercial-only session, auto-route
          navigate({ to: "/dashboard" });
          return;
        }
        // If they have gov access, they stay on the gateway to choose
      }
      
      setCheckingAuth(false);
    }
    
    checkAuth();
  }, [navigate]);

  if (checkingAuth) {
    return (
      <div className="bg-[#06060a] min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    );
  }
  return (
    <div className="bg-[#06060a] min-h-screen text-[#f2f2f7] antialiased flex flex-col items-center justify-center font-['Space_Grotesk'] p-6 relative overflow-hidden">
      {/* Lightweight gradient background */}
      <div className="absolute inset-0 bg-emerald-600 from-[#06060a] via-[#101018] to-[#06060a] -z-10" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/10 blur-[100px] rounded-full -z-10" />

      <div className="text-center mb-12">
        <div className="text-4xl font-bold mb-4 tracking-tight">Trace</div>
        <p className="text-white/60 text-lg">Automated Attribution Engine</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl mb-8">
        <Link 
          to="/government" 
          className="block group relative p-8 rounded-2xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.05] hover:border-indigo-500/50 transition-all text-left overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
            →
          </div>
          <h2 className="text-xl font-semibold mb-2">Government & Law Enforcement</h2>
          <p className="text-white/50 text-sm">Secure, rapid attribution and SAHYOG integration for official agency investigations.</p>
        </Link>

        <Link 
          to="/commercial" 
          className="block group relative p-8 rounded-2xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.05] hover:border-emerald-500/50 transition-all text-left overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
            →
          </div>
          <h2 className="text-xl font-semibold mb-2">Compliance Teams & VASPs</h2>
          <p className="text-white/50 text-sm">Forensic intelligence, sanctions screening, and transparent hop scoring for compliance.</p>
        </Link>
      </div>

      <Link to="/government" className="text-sm text-white/40 hover:text-white/80 underline underline-offset-4 transition-colors mb-16">
        Skip to agency view
      </Link>

      <div className="absolute bottom-6 text-center text-[10px] text-white/30 uppercase tracking-widest">
        © 2026 Trace — Blockchain Forensics
      </div>
    </div>
  );
}
