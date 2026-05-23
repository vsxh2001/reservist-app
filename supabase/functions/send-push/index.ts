// send-push: VAPID-signed Web Push fan-out for the reservist app.
//
// Invoked from the React client via supabase.functions.invoke('send-push', { body })
// with the caller's JWT in the Authorization header. The function:
//
//   1. Verifies the caller is a signed-in member.
//   2. Resolves the caller to a member row, and (if `team_id` is supplied)
//      verifies the caller is a commander of that team. Non-commanders are
//      allowed to push only to themselves (used by `sendTestPush` from the
//      reservist dashboard's "Send test push" affordance — same path, no
//      separate endpoint).
//   3. Loads every push_subscriptions row for the requested recipients.
//   4. Sends a VAPID-signed Web Push to each endpoint.
//   5. Cleans up subscriptions that the push service has revoked
//      (404 / 410) so we don't keep retrying dead endpoints.
//
// Env required (set via `supabase secrets set`):
//   VAPID_PUBLIC_KEY        urlsafe-base64
//   VAPID_PRIVATE_KEY       urlsafe-base64
//   VAPID_SUBJECT           mailto:… or https://…
//   SUPABASE_URL            auto-injected by SB runtime
//   SUPABASE_SERVICE_ROLE_KEY  auto-injected by SB runtime

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import webpush from "npm:web-push@3.6.7";

interface Payload {
  /** Member ids whose subscriptions should receive the push. */
  member_ids: string[];
  /** Optional team scope. If supplied, caller must be a commander of this team. */
  team_id?: string;
  /** Notification title (≤ ~50 chars works best across platforms). */
  title: string;
  /** Notification body. */
  body: string;
  /** Optional URL the SW opens on `notificationclick`. Defaults to the app root. */
  url?: string;
  /** Optional `tag` — same tag replaces an unread notification on the device. */
  tag?: string;
}

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:devnull@reservist.local";
const SB_URL = Deno.env.get("SUPABASE_URL");
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return jsonResponse({ error: "vapid_keys_not_configured" }, 500);
  }
  if (!SB_URL || !SB_SERVICE_KEY) {
    return jsonResponse({ error: "supabase_env_not_configured" }, 500);
  }

  // 1. Caller JWT verification: the Authorization header is required so we
  //    know who is asking. We use the service-role client below for the
  //    actual reads to avoid RLS-related complexity in the function path.
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return jsonResponse({ error: "missing_auth" }, 401);

  const userClient = createClient(SB_URL, SB_SERVICE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userResp, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userResp.user) {
    return jsonResponse({ error: "invalid_auth" }, 401);
  }
  const callerAuthUserId = userResp.user.id;

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
  if (!Array.isArray(payload.member_ids) || payload.member_ids.length === 0) {
    return jsonResponse({ error: "member_ids_required" }, 400);
  }
  if (!payload.title || !payload.body) {
    return jsonResponse({ error: "title_and_body_required" }, 400);
  }
  // Defensive caps. Every notify.ts helper in the web client builds short
  // strings (titles like "Urgent: …" stay well under 100 chars), so these
  // limits are inert for the happy path. They reject pathological payloads
  // before we waste service-role cycles fanning out to dozens of devices.
  if (payload.title.length > 200) {
    return jsonResponse({ error: "title_too_long" }, 400);
  }
  if (payload.body.length > 4000) {
    return jsonResponse({ error: "body_too_long" }, 400);
  }
  if (payload.url && payload.url.length > 2000) {
    return jsonResponse({ error: "url_too_long" }, 400);
  }
  if (payload.tag && payload.tag.length > 256) {
    return jsonResponse({ error: "tag_too_long" }, 400);
  }
  if (payload.member_ids.length > 1000) {
    return jsonResponse({ error: "too_many_recipients" }, 400);
  }

  // Service-role client for the rest of the work — RLS bypass is intentional;
  // we enforce authorization explicitly below.
  const admin = createClient(SB_URL, SB_SERVICE_KEY);

  // 2. Resolve the caller's member row and authorize.
  const { data: callerMember } = await admin
    .from("members")
    .select("id")
    .eq("auth_user_id", callerAuthUserId)
    .maybeSingle();
  if (!callerMember) {
    return jsonResponse({ error: "caller_not_linked_to_member" }, 403);
  }
  const callerMemberId = callerMember.id as string;

  const sendingToSelfOnly =
    payload.member_ids.length === 1 && payload.member_ids[0] === callerMemberId;

  if (!sendingToSelfOnly) {
    if (!payload.team_id) {
      return jsonResponse({ error: "team_id_required_for_fanout" }, 400);
    }
    const { data: tm } = await admin
      .from("team_members")
      .select("role")
      .eq("team_id", payload.team_id)
      .eq("member_id", callerMemberId)
      .maybeSingle();
    if (!tm || tm.role !== "commander") {
      return jsonResponse({ error: "not_a_commander_of_team" }, 403);
    }
    // Constrain recipients to actual members of the same team — no
    // cross-team blast even if the caller passes foreign ids.
    const { data: teamMembers } = await admin
      .from("team_members")
      .select("member_id")
      .eq("team_id", payload.team_id);
    const allowed = new Set<string>(
      ((teamMembers ?? []) as { member_id: string }[]).map((r) => r.member_id),
    );
    payload.member_ids = payload.member_ids.filter((id) => allowed.has(id));
    if (payload.member_ids.length === 0) {
      return jsonResponse({ sent: 0, removed: 0 });
    }
  }

  // 3. Load every push_subscriptions row for these members.
  const { data: subs, error: subsErr } = await admin
    .from("push_subscriptions")
    .select("id, member_id, endpoint, p256dh, auth")
    .in("member_id", payload.member_ids);
  if (subsErr) return jsonResponse({ error: subsErr.message }, 500);

  // 4. Send VAPID-signed pushes in parallel.
  const notif = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
    tag: payload.tag,
  });
  const deadIds: string[] = [];
  let sent = 0;
  type Sub = { id: string; member_id: string; endpoint: string; p256dh: string; auth: string };
  const allSubs = (subs ?? []) as Sub[];

  // Cap parallelism: with no batching, a 1000-member fan-out fires 1000
  // simultaneous HTTPS connections to FCM / APNs / etc., spikes Edge
  // Function memory, and risks rate-limiting from the push service. 50
  // concurrent sends per batch keeps memory bounded and stays well under
  // most provider per-source quotas.
  const BATCH_SIZE = 50;
  const sendOne = async (s: Sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        notif,
        { TTL: 60 * 60 * 24 },
      );
      sent += 1;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Permanently dead endpoint — clean up so we stop retrying.
        deadIds.push(s.id);
      } else {
        // Audit finding: don't log the raw push endpoint — it's a secret
        // handle to the user's device that an attacker with log access
        // could use to push to them directly. Log the DB row id + the HTTP
        // status code instead; that's enough to triage from sentry.
        const message = err instanceof Error ? err.message : String(err);
        console.warn("send-push failed", {
          sub_id: s.id,
          member_id: s.member_id,
          statusCode,
          message,
        });
      }
    }
  };

  for (let i = 0; i < allSubs.length; i += BATCH_SIZE) {
    await Promise.all(allSubs.slice(i, i + BATCH_SIZE).map(sendOne));
  }

  // 5. Reap dead subscriptions.
  if (deadIds.length) {
    await admin.from("push_subscriptions").delete().in("id", deadIds);
  }

  return jsonResponse({ sent, removed: deadIds.length });
});
