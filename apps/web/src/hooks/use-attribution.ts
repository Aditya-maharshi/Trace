import { useState } from "react";
import { getAttribution, getNarrative, AttributionResponse, ApiError } from "@/lib/api";

export function useAttribution() {
  const [data, setData] = useState<AttributionResponse | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = async (address: string) => {
    setData(null);
    setNarrative(null);
    setError(null);
    setLoading(true);

    try {
      const result = await getAttribution(address);
      setData(result);
      setLoading(false);

      if (result.nearestVasp) {
        // Fetch narrative async, do not block or throw page error if it fails
        getNarrative(result)
          .then((narrativeRes) => setNarrative(narrativeRes.narrative))
          .catch((err) => {
            console.error("Failed to fetch narrative", err);
            setNarrative("Narrative could not be generated at this time.");
          });
      } else {
        setNarrative("No VASP found to attribute to.");
      }
    } catch (err) {
      setLoading(false);
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred while tracing the wallet.");
      }
    }
  };

  return { data, narrative, loading, error, lookup };
}
