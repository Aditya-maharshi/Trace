import { formatDistanceToNow } from "date-fns";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { type PathResult, truncateAddress } from "@/lib/types";

function safeFormatDistance(timestamp?: string): string {
  if (!timestamp) return "recent";
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "recent";
  try {
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return "recent";
  }
}

export function PathBreakdown({ paths }: { paths: PathResult[] }) {
  const hops = paths[0]?.hops ?? [];
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="path" className="border-none">
        <AccordionTrigger className="text-sm text-foreground/70">
          View full path details
        </AccordionTrigger>
        <AccordionContent>
          <ul className="space-y-3">
            {hops.slice(1).map((hop, i) => (
              <li key={`${hop.address}-${i}`} className="flex justify-between gap-4 text-sm">
                <span className="font-mono text-xs text-foreground/70">
                  {hop.ensName ?? truncateAddress(hop.address)}
                </span>
                <span className="text-foreground/50">
                  {hop.valueEth} ETH · {safeFormatDistance(hop.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
