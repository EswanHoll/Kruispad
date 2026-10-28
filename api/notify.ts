import type { VercelRequest, VercelResponse } from "@vercel/node";
import sgMail from "@sendgrid/mail";
import {
  actionButtonLabel,
  buildActionUrl,
  type EmailAction,
} from "../src/lib/emailActions";
import {
  appBaseUrl,
  assertNotifyAuthorized,
  createAdminClient,
  env,
  type AdminClient,
} from "./_supabaseAdmin";

type NotifyBody = {
  requestId?: string;
  action?: string;
};

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  role: string;
};

type AttachmentRow = {
  storage_path: string;
  file_name: string;
};

async function mint(supabase: AdminClient, recipientId: string, requestId: string, action: EmailAction) {
  const { data, error } = await supabase.rpc("mint_action_token", {
    p_recipient_id: recipientId,
    p_request_id: requestId,
    p_action: action,
    p_ttl_hours: 168,
  });
  if (error) throw error;
  return data as string;
}

async function signedAttachmentLinks(
  supabase: AdminClient,
  attachments: AttachmentRow[],
): Promise<string[]> {
  const lines: string[] = [];
  for (const att of attachments) {
    const { data, error } = await supabase.storage
      .from("kruispad-attachments")
      .createSignedUrl(att.storage_path, 60 * 60 * 24 * 7);
    if (error || !data?.signedUrl) {
      lines.push(`- ${att.file_name}`);
      continue;
    }
    lines.push(`- ${att.file_name}: ${data.signedUrl}`);
  }
  return lines;
}

function summaryBlock(opts: {
  beneficiary: string;
  amount: number;
  paymentType: string;
  dateRequested: string;
  description: string;
  attachments: string[];
  link: string;
}): string {
  const plainDesc = opts.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return [
    `Beneficiary: ${opts.beneficiary}`,
    `Amount: ZAR ${Number(opts.amount).toFixed(2)}`,
    `Type: ${opts.paymentType}`,
    `Date requested: ${opts.dateRequested}`,
    `Description: ${plainDesc}`,
    "",
    "Attachments:",
    ...(opts.attachments.length ? opts.attachments : ["- (none)"]),
    "",
    `View in app: ${opts.link}`,
  ].join("\n");
}

function htmlEmail(opts: {
  title: string;
  intro: string;
  summaryText: string;
  buttons: { label: string; url: string; primary?: boolean }[];
}): string {
  const buttonHtml = opts.buttons
    .map((b) => {
      const bg = b.primary === false ? "#9b1c1c" : "#0b3d3a";
      return `<a href="${b.url}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 18px;background:${bg};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:700;">${b.label}</a>`;
    })
    .join("");
  return `<!doctype html><html><body style="font-family:Figtree,Arial,sans-serif;color:#102a27;line-height:1.5;">
  <h1 style="font-family:Georgia,serif;color:#0b3d3a;">${opts.title}</h1>
  <p>${opts.intro}</p>
  <pre style="white-space:pre-wrap;background:#f7f3ec;padding:12px;border-radius:8px;">${opts.summaryText.replace(/</g, "&lt;")}</pre>
  <p>${buttonHtml}</p>
  <p style="font-size:12px;color:#14605b;">Buttons open a secure one-time page. No password required. Links expire and can be used once.</p>
  </body></html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  try {
    await assertNotifyAuthorized(req);
  } catch {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  let supabase: AdminClient;
  try {
    supabase = createAdminClient();
  } catch {
    res.status(503).json({ error: "supabase_not_configured" });
    return;
  }

  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as NotifyBody;
  if (!body.requestId || !body.action) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  const { data: request, error: reqError } = await supabase
    .from("payment_requests")
    .select("*")
    .eq("id", body.requestId)
    .maybeSingle();
  if (reqError || !request) {
    res.status(404).json({ error: "request_not_found" });
    return;
  }

  const [{ data: initiator }, { data: roleProfiles }, { data: attachments }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", request.initiator_id).maybeSingle(),
    supabase
      .from("profiles")
      .select("*")
      .in("role", ["approver_fred", "approver_anton", "finance", "admin"]),
    supabase.from("request_attachments").select("storage_path,file_name").eq("request_id", request.id),
  ]);

  const byRole = (role: string) =>
    ((roleProfiles ?? []) as ProfileRow[]).filter((p) => p.role === role);

  const base = appBaseUrl();
  const appLink = `${base}/requests/${request.id}`;
  const attachmentLines = await signedAttachmentLinks(
    supabase,
    (attachments ?? []) as AttachmentRow[],
  );
  const summary = summaryBlock({
    beneficiary: request.beneficiary_name,
    amount: Number(request.amount),
    paymentType: request.payment_type,
    dateRequested: request.date_requested,
    description: request.description,
    attachments: attachmentLines,
    link: appLink,
  });
  const subjectBase = `Kruispad — ${request.beneficiary_name}`;
  const action = body.action;

  type OutMail = {
    to: string[];
    subject: string;
    text: string;
    html: string;
  };
  const messages: OutMail[] = [];

  async function actionMail(
    recipients: ProfileRow[],
    actions: EmailAction[],
    subject: string,
    intro: string,
  ) {
    for (const person of recipients) {
      if (!person.email) continue;
      const buttons: { label: string; url: string; primary?: boolean }[] = [];
      const textButtons: string[] = [];
      for (const act of actions) {
        const raw = await mint(supabase, person.id, request.id, act);
        const url = buildActionUrl(base, raw);
        const label = actionButtonLabel(act);
        buttons.push({
          label,
          url,
          primary: !act.includes("decline"),
        });
        textButtons.push(`${label}: ${url}`);
      }
      messages.push({
        to: [person.email],
        subject,
        text: `${intro}\n\n${summary}\n\nActions (open in browser — do not reply):\n${textButtons.join("\n")}`,
        html: htmlEmail({
          title: subject,
          intro,
          summaryText: summary,
          buttons,
        }),
      });
    }
  }

  if (action === "submit") {
    await actionMail(
      byRole("approver_fred"),
      ["fred_approve", "fred_decline"],
      `${subjectBase} — awaiting your approval`,
      "A payment request was submitted. Use the buttons below (no login).",
    );
    await actionMail(
      byRole("approver_anton"),
      ["anton_approve", "anton_decline"],
      `${subjectBase} — awaiting your approval`,
      "A payment request was submitted. Use the buttons below (no login).",
    );
  } else if (
    (action === "fred_approve" || action === "anton_approve") &&
    request.status === "fully_approved"
  ) {
    await actionMail(
      byRole("finance"),
      ["finance_pay", "finance_decline"],
      `${subjectBase} — fully approved, ready to pay`,
      "Both approvers approved. Mark paid or decline with a reason (no login).",
    );
  } else if (action === "fred_approve" || action === "anton_approve") {
    if (initiator?.email) {
      messages.push({
        to: [initiator.email],
        subject: `${subjectBase} — partial approval`,
        text: `One approver has approved. Awaiting the second approval.\n\n${summary}`,
        html: htmlEmail({
          title: `${subjectBase} — partial approval`,
          intro: "One approver has approved. Awaiting the second approval.",
          summaryText: summary,
          buttons: [{ label: "Open request", url: appLink }],
        }),
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
        subject: `${subjectBase} — declined (returned to Drafted)`,
        text: `Your request was declined and returned to Drafted. Sign in with a magic link to revise.\n\n${summary}\n\nMagic link sign-in: ${base}/login`,
        html: htmlEmail({
          title: `${subjectBase} — declined`,
          intro: "Your request was declined and returned to Drafted. Use a magic link to sign in and revise.",
          summaryText: summary,
          buttons: [{ label: "Magic link sign-in", url: `${base}/login` }],
        }),
      });
    }
  } else if (action === "finance_pay") {
    const admins = byRole("admin");
    await actionMail(
      admins,
      ["print_document"],
      `${subjectBase} — paid, ready to print`,
      "Payment executed. Mark the document printed/filed (no login).",
    );
    if (initiator?.email) {
      messages.push({
        to: [initiator.email],
        subject: `${subjectBase} — paid`,
        text: `Payment was executed. Pending document print/file.\n\n${summary}`,
        html: htmlEmail({
          title: `${subjectBase} — paid`,
          intro: "Payment was executed. Pending document print/file.",
          summaryText: summary,
          buttons: [{ label: "Open request", url: appLink }],
        }),
      });
    }
  } else if (action === "print_document") {
    if (initiator?.email) {
      messages.push({
        to: [initiator.email],
        subject: `${subjectBase} — document printed`,
        text: `Document printed/filed. Workflow complete.\n\n${summary}`,
        html: htmlEmail({
          title: `${subjectBase} — document printed`,
          intro: "Document printed/filed. Workflow complete.",
          summaryText: summary,
          buttons: [{ label: "Open request", url: appLink }],
        }),
      });
    }
  }

  // Reuse GekkoFlow / BWS SendGrid names — no new API key.
  const sendgridKey = env("SENDGRID_API_KEY", "SENDGRID_API_KEY__ORG");
  const from =
    env("SENDGRID_FROM_EMAIL", "SENDGRID_FROM__PROJ_KRUISPAD", "SENDGRID_FROM") ??
    "noreply@gekkoflow.com";

  if (!sendgridKey) {
    res.status(202).json({
      ok: true,
      emailed: 0,
      prepared: messages.length,
      skipped: "sendgrid_not_configured",
    });
    return;
  }

  sgMail.setApiKey(sendgridKey);
  let emailed = 0;
  for (const msg of messages) {
    const recipients = [...new Set(msg.to.filter(Boolean))];
    if (recipients.length === 0) continue;
    try {
      await sgMail.send({
        to: recipients,
        from,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      });
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : "send_failed";
      res.status(502).json({ error: "sendgrid_send_failed", detail });
      return;
    }
    emailed += recipients.length;
  }

  res.status(200).json({ ok: true, emailed });
}
