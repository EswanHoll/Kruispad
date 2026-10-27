import type { VercelRequest, VercelResponse } from "@vercel/node";
import sgMail from "@sendgrid/mail";
import { createClient } from "@supabase/supabase-js";

/**
 * Email notifications per spec §2.7.
 * Secrets from Bitwarden / host env (names in docs/architecture/SECRETS_INVENTORY.md).
 * Never logs secret values.
 */

type NotifyBody = {
  requestId?: string;
  action?: string;
};

function env(name: string, ...aliases: string[]): string | undefined {
  for (const key of [name, ...aliases]) {
    const value = process.env[key];
    if (value) return value;
  }
  return undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const supabaseUrl = env("SUPABASE_URL__PROJ_KRUISPAD", "SUPABASE_URL", "VITE_SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY__PROJ_KRUISPAD", "SUPABASE_SERVICE_ROLE_KEY");
  const sendgridKey = env("SENDGRID_API_KEY__PROJ_KRUISPAD", "SENDGRID_API_KEY");
  const from = env("SENDGRID_FROM__PROJ_KRUISPAD", "SENDGRID_FROM");
  const baseUrl = env("APP_BASE_URL__PROJ_KRUISPAD", "APP_BASE_URL", "VITE_APP_BASE_URL");

  if (!supabaseUrl || !serviceKey) {
    res.status(503).json({ error: "supabase_not_configured" });
    return;
  }

  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as NotifyBody;
  if (!body.requestId || !body.action) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: request, error: reqError } = await supabase
    .from("payment_requests")
    .select("*")
    .eq("id", body.requestId)
    .maybeSingle();
  if (reqError || !request) {
    res.status(404).json({ error: "request_not_found" });
    return;
  }

  const { data: initiator } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", request.initiator_id)
    .maybeSingle();

  const { data: roleProfiles } = await supabase
    .from("profiles")
    .select("*")
    .in("role", ["approver_fred", "approver_anton", "finance", "admin"]);

  const byRole = (role: string) =>
    (roleProfiles ?? []).filter((p) => p.role === role).map((p) => p.email as string);

  const link = `${baseUrl ?? ""}/requests/${request.id}`;
  const subjectBase = `Kruispad payment request — ${request.beneficiary_name}`;
  const action = body.action;

  const messages: { to: string[]; subject: string; text: string }[] = [];

  if (action === "submit") {
    messages.push({
      to: [...byRole("approver_fred"), ...byRole("approver_anton")],
      subject: `${subjectBase} submitted`,
      text: `A request was submitted and awaits parallel approval.\n${link}`,
    });
  } else if (
    (action === "fred_approve" || action === "anton_approve") &&
    request.status === "fully_approved"
  ) {
    messages.push({
      to: byRole("finance"),
      subject: `${subjectBase} fully approved`,
      text: `Both approvers approved. Ready for payment.\n${link}`,
    });
  } else if (action === "fred_approve" || action === "anton_approve") {
    if (initiator?.email) {
      messages.push({
        to: [initiator.email],
        subject: `${subjectBase} partial approval`,
        text: `One approver has approved. Awaiting the second approval.\n${link}`,
      });
    }
  } else if (
    action === "fred_decline" ||
    action === "anton_decline" ||
    action === "finance_decline"
  ) {
    if (initiator?.email) {
      messages.push({
        to: [initiator.email],
        subject: `${subjectBase} declined`,
        text: `Your request was declined and returned to Drafted. Open the audit timeline for the reason.\n${link}`,
      });
    }
  } else if (action === "finance_pay") {
    messages.push({
      to: [initiator?.email, ...byRole("admin")].filter(Boolean) as string[],
      subject: `${subjectBase} paid`,
      text: `Payment was executed. Pending document print/file.\n${link}`,
    });
  } else if (action === "print_document") {
    if (initiator?.email) {
      messages.push({
        to: [initiator.email],
        subject: `${subjectBase} document printed`,
        text: `Document printed/filed. Workflow complete.\n${link}`,
      });
    }
  }

  if (!sendgridKey || !from) {
    res.status(202).json({ ok: true, emailed: 0, skipped: "sendgrid_not_configured" });
    return;
  }

  sgMail.setApiKey(sendgridKey);
  let emailed = 0;
  for (const msg of messages) {
    const recipients = [...new Set(msg.to.filter(Boolean))];
    if (recipients.length === 0) continue;
    await sgMail.send({
      to: recipients,
      from,
      subject: msg.subject,
      text: msg.text,
    });
    emailed += recipients.length;
  }

  res.status(200).json({ ok: true, emailed });
}
