import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { API_BASE } from "@/lib/api";

export function useSahyogQueue() {
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch(`${API_BASE}/api/sahyog/queue`, {
        headers: {
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {})
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setQueue(data);
      } else {
        setError(`Failed to fetch: ${res.statusText}`);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  return { queue, loading, error, refetch: fetchQueue };
}
