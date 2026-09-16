import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { CaseBoard } from "@/components/cases/CaseBoard";
import { Toaster } from "sonner";
import { History, LogOut, LayoutDashboard, Shield } from "lucide-react";

export const Route = createFileRoute("/cases")({
  head: () => ({
    meta: [
      { title: "Trace — Case Management Board" },
      {
        name: "description",
        content: "Compliance case management Kanban board with automated SLA tracking and state machine enforcement.",
      },
      { property: "og:title", content: "Trace — Case Management Board" },
    ],
  }),
  component: CasesPage,
});

function CasesPage() {
  const navigate = useNavigate();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (localStorage.getItem("trace_guest_session")) {
      setCheckedAuth(true);
      const demoProvider = localStorage.getItem("trace_demo_provider");
      setUserEmail(demoProvider ? `${demoProvider} demo analyst` : "guest analyst");
      return;
    }

    supabase.auth.getSession().then((res) => {
      if (res.data.session) {
        setCheckedAuth(true);
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (user?.email) setUserEmail(user.email);
        });
      } else {
        navigate({ to: "/login" });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setCheckedAuth(true);
      } else if (!localStorage.getItem("trace_guest_session")) {
        navigate({ to: "/login" });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

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

  return (
    <main className="min-h-screen relative overflow-x-hidden bg-[#06060a] text-white">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-1/4 -left-1/4 w-[70vw] h-[70vw] rounded-full bg-[#f7931a]/[0.06] blur-[200px]" />
        <div className="absolute -bottom-1/4 -right-1/4 w-[70vw] h-[70vw] rounded-full bg-[#8c9dfc]/[0.06] blur-[200px]" />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      {/* Topbar */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-xl">
        <Link to="/" className="flex items-center gap-2.5 group">
          <span className="w-2 h-2 rounded-full bg-[#f7931a] shadow-[0_0_12px_2px_rgba(247,147,26,0.8)]"></span>
          <span className="font-serif text-lg font-semibold tracking-tight text-white group-hover:text-orange-300 transition-colors">
            Trace
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <Link
            to="/dashboard"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition-all"
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            Dashboard
          </Link>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-orange-400 bg-orange-500/10 font-medium">
            <Shield className="h-3.5 w-3.5" />
            Cases
          </div>
          <Link
            to="/history"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition-all"
          >
            <History className="h-3.5 w-3.5" />
            History
          </Link>
          {userEmail && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-white/5 border border-white/10 text-white/70 mr-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              {userEmail}
            </span>
          )}
          <button
            id="signout-btn"
            onClick={async () => {
              localStorage.removeItem("trace_guest_session");
              localStorage.removeItem("trace_demo_provider");
              await supabase.auth.signOut();
              navigate({ to: "/login", search: { switch: "true" } as any });
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white/50 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </header>

      {/* Board */}
      <div className="relative z-10 px-6 py-6">
        <CaseBoard />
      </div>

      {/* Sonner toast container */}
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: 'rgba(15, 15, 25, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(12px)',
          },
        }}
      />
    </main>
  );
}
