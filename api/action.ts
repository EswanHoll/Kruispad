import type { VercelRequest, VercelResponse } from "@vercel/node";
import { actionRequiresReason, isEmailAction } from "../src/lib/emailActions";
import { apiOrigin, createAdminClient, env } from "./_supabaseAdmin";

/**
 * GET  ?token=… → peek token + request summary (no login)
 * POST { token, reason? } → execute_email_action (same apply_* RPCs, channel=email_link)
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    res.status(503).json({ error: "supabase_not_configured" });
    return;
  }

  if (req.method === "GET") {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (!token) {
      res.status(400).json({ error: "missing_token" });
      return;
    }
    const { data, error } = await supabase.rpc("peek_action_token", { p_token: token });
    if (error) {
      res.status(404).json({ error: error.message });
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const { data: attachments } = await supabase
      .from("request_attachments")
      .select("id,file_name,storage_path,content_type,byte_size")
      .eq("request_id", row.request_id);

    const files = [];
    for (const att of attachments ?? []) {
      const signed = await supabase.storage
        .from("kruispad-attachments")
        .createSignedUrl(att.storage_path, 60 * 30);
      files.push({
        file_name: att.file_name,
        content_type: att.content_type,
        byte_size: att.byte_size,
        url: signed.data?.signedUrl ?? null,
      });
    }

    res.status(200).json({
      action: row.action,
      requiresReason: isEmailAction(row.action) ? actionRequiresReason(row.action) : false,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      recipientName: row.recipient_name,
      request: {
        id: row.request_id,
        beneficiary_name: row.beneficiary_name,
        amount: row.amount,
        payment_type: row.payment_type,
        description: row.description,
        status: row.status,
        date_requested: row.date_requested,
      },
      attachments: files,
    });
    return;
  }

  if (req.method === "POST") {
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as {
      token?: string;
      reason?: string;
    };
    if (!body.token) {
      res.status(400).json({ error: "missing_token" });
      return;
    }

    const { data: peeked, error: peekError } = await supabase.rpc("peek_action_token", {
      p_token: body.token,
    });
    if (peekError) {
      res.status(404).json({ error: peekError.message });
      return;
    }
    const peekRow = Array.isArray(peeked) ? peeked[0] : peeked;
    if (!peekRow || !isEmailAction(peekRow.action)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (peekRow.used_at) {
      res.status(409).json({ error: "token_already_used" });
      return;
    }
    if (new Date(peekRow.expires_at).getTime() <= Date.now()) {
      res.status(409).json({ error: "token_expired" });
      return;
    }
    if (actionRequiresReason(peekRow.action) && !body.reason?.trim()) {
      res.status(400).json({ error: "decline_reason_required" });
      return;
    }

    const { data, error } = await supabase.rpc("execute_email_action", {
      p_token: body.token,
      p_reason: body.reason?.trim() || null,
    });
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    // Fan-out next notifications (same as in-app transitions).
    const result = data as { id: string; status: string };
    const notifyAction =
      peekRow.action === "fred_approve" || peekRow.action === "anton_approve"
        ? peekRow.action
        : peekRow.action;

    const notifyHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const notifySecret = env("KRUISPAD_NOTIFY_SECRET__PROJ_KRUISPAD", "KRUISPAD_NOTIFY_SECRET");
    if (notifySecret) {
      notifyHeaders["x-kruispad-notify-secret"] = notifySecret;
    }
    void fetch(`${apiOrigin()}/api/kruispad/notify`, {
      method: "POST",
      headers: notifyHeaders,
      body: JSON.stringify({ requestId: result.id, action: notifyAction }),
    }).catch(() => undefined);

    res.status(200).json({ ok: true, request: data });
    return;
  }

  res.status(405).json({ error: "method_not_allowed" });
}
