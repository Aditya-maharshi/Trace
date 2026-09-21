import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Trace — Privacy Policy" },
      { name: "description", content: "Privacy Policy for the Trace AML platform." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-black text-slate-300 font-sans pb-24">
      <header className="px-6 py-8 border-b border-white/10 flex justify-between items-center">
        <Link to="/" className="text-xl font-bold text-white font-mono">Trace</Link>
      </header>
      <main className="max-w-3xl mx-auto pt-16 px-6">
        <h1 className="text-3xl font-bold text-white mb-8">Privacy Policy</h1>
        <p className="mb-4">Last Updated: {new Date().toLocaleString("default", { month: "long", year: "numeric" })}</p>
        
        <div className="space-y-8 mt-12 text-sm leading-relaxed text-slate-400">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. Information We Collect</h2>
            <p>
              When you use Trace, we collect account information (email, organization details), usage logs, and the wallet addresses/transaction hashes you submit for analysis. To protect privacy and mitigate DDoS abuse, we HMAC hash all client IP addresses before storage; plaintext IP addresses are never retained.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. Data Retention</h2>
            <p>
              Trace is an active investigative tool, not a permanent system of record.
              All submitted wallet addresses, resulting attribution data, and generated reports (including SAHYOG payloads) are retained for a standard TTL of 30 days unless a longer retention period is explicitly configured by your organization's enterprise agreement. 
              After the retention period expires, case evidence and history are aggressively purged.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. Third-Party Processors</h2>
            <p className="mb-2">We utilize the following third-party subprocessors to provide our core attribution and infrastructure services:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Supabase:</strong> Database hosting, authentication, and secure edge functions.</li>
              <li><strong>Upstash:</strong> Redis caching and rate-limiting.</li>
              <li><strong>Google (Gemini) & Groq:</strong> AI narrative generation and risk summarization.</li>
              <li><strong>OpenSanctions:</strong> Global sanctions and watchlist screening.</li>
              <li><strong>Etherscan & Blockscout:</strong> On-chain transaction retrieval.</li>
              <li><strong>Stripe:</strong> Payment processing (Commercial users only).</li>
              <li><strong>Sentry:</strong> Error tracking and telemetry (stack traces only, PII scrubbed).</li>
              <li><strong>External Chatbot APIs:</strong> For conversational trace interactions (configured per organization).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Government & Law Enforcement Sharing (SAHYOG)</h2>
            <p>
              If your organization is a verified law enforcement agency using the SAHYOG integration, Trace acts as a secure conduit to transmit Section 94 Summons and Section 63 Certificates directly to Virtual Asset Service Providers (VASPs). Trace logs the transmission event for chain-of-custody purposes but does not independently share your case data with other agencies without your explicit instruction.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy or wish to exercise your data rights under GDPR or the Indian DPDP Act, please contact our security team at <a href="mailto:security@trace.com" className="text-blue-400 hover:underline">security@trace.com</a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
