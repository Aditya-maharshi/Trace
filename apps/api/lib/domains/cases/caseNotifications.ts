/**
 * lib/caseNotifications.ts
 *
 * Dispatches outbound notifications (e.g. to Slack Webhook or generic endpoint)
 * when automated case escalations or SLA breaches occur.
 * Fire-and-forget; failures are logged but never block case state transitions.
 */

export interface NotificationPayload {
  event: 'case_escalated' | 'sla_breached' | 'evidence_drift_detected';
  caseId: string;
  title: string;
  details: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export async function sendCaseNotification(payload: NotificationPayload): Promise<void> {
  const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
  if (!webhookUrl) {
    return;
  }

  try {
    const slackFormatted = {
      text: `🚨 *[Trace Compliance Alert]* ${payload.event.toUpperCase().replace(/_/g, ' ')}\n*Case:* ${payload.title} (\`${payload.caseId}\`)\n*Details:* ${payload.details}`,
      attachments: payload.metadata
        ? [
            {
              color: payload.event === 'case_escalated' ? '#ff4444' : '#ffaa00',
              fields: Object.entries(payload.metadata).map(([k, v]) => ({
                title: k,
                value: typeof v === 'object' ? JSON.stringify(v) : String(v),
                short: true,
              })),
            },
          ]
        : [],
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackFormatted),
    });

    if (!res.ok) {
      console.warn(`[caseNotifications] Webhook responded with status ${res.status}`);
    }
  } catch (err) {
    console.warn('[caseNotifications] Failed to send notification webhook:', err);
  }
}
