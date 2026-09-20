export function resolveRedirect(raw: string | null | undefined, track: "commercial" | "government", dashboardPath: string): string {
  if (!raw || typeof raw !== "string") return dashboardPath;
  
  try {
    // We only care about the pathname for resolution
    const url = new URL(raw, "http://localhost");
    let path = url.pathname;
    
    // Legacy mappings
    if (path === "/dashboard" || path === "/commercial") return "/commercial/dashboard";
    if (path === "/history") return "/commercial/dashboard?tab=history";
    if (path === "/government") return "/government/dashboard";
    if (path === "/cases") return "/government/dashboard?view=docket";

    // Rejection checks: cross-track or external
    if (path.startsWith("//") || path.startsWith("\\")) return dashboardPath;
    if (!path.startsWith(`/${track}/`)) return dashboardPath;

    return raw;
  } catch {
    return dashboardPath;
  }
}
