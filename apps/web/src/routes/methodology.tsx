import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";

export const Route = createFileRoute("/methodology")({
  component: MethodologyPage,
});

function MethodologyPage() {
  const [methodology, setMethodology] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/methodology`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch methodology");
        return res.json();
      })
      .then((data) => {
        setMethodology(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <main className="min-h-screen relative overflow-x-hidden bg-[#06060a] text-white py-12 px-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-4xl font-serif font-bold text-white mb-6">Trace Methodology</h1>
        
        {loading && <p className="text-white/50">Loading methodology...</p>}
        {error && <p className="text-rose-400">Error: {error}</p>}
        
        {methodology && (
          <div className="space-y-6">
            <section className="bg-white/5 border border-white/10 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-3">Notice</h2>
              <p className="text-white/70 leading-relaxed">{methodology.notice}</p>
            </section>
            
            <section className="bg-white/5 border border-white/10 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-3">VASP Registry</h2>
              <p className="text-white/70 leading-relaxed">{methodology.vaspRegistryNotice}</p>
            </section>

            <section className="bg-white/5 border border-white/10 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-3">Sanctions Screening</h2>
              <p className="text-white/70 leading-relaxed">{methodology.sanctionsSource}</p>
            </section>
            
            <section className="bg-white/5 border border-white/10 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-3">Human Review Disclaimer</h2>
              <p className="text-white/70 leading-relaxed">{methodology.humanReviewDisclaimer}</p>
            </section>

            <section className="bg-white/5 border border-white/10 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-3">Calibration</h2>
              <ul className="text-white/70 leading-relaxed list-disc list-inside space-y-2">
                <li><strong>Date:</strong> {methodology.calibrationDate}</li>
                <li><strong>Sample Size:</strong> {methodology.calibrationSample}</li>
              </ul>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
