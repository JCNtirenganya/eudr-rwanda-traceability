// One Edge Function for the chain tables only. The Portal token is the only credential the browser sends.
// Real farms, farmers and CWS stay in ArcGIS; Supabase holds deliveries, lots, batches and links.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SB = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTAL = Deno.env.get("PORTAL_URL") ?? "https://gis.naeb.gov.rw/portal";
const OWNER = Deno.env.get("PORTAL_OWNER") ?? "Coffee_Trace";
const CHAIN = new Set([
  "cherry_delivery", "lot", "lot_delivery", "export_batch", "batch_lot", "exporter", "importer",
]);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ok = (value: unknown) => ({ ok: true, value });
const fail = (message: string) => ({ ok: false, error: message });

async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  if (!r.ok) throw new Error(`Database refused the request (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

async function identity(portalToken: string) {
  if (!portalToken) throw new Error("Sign in with your Portal account first.");
  const u = new URL(`${PORTAL}/sharing/rest/community/self`);
  u.searchParams.set("token", portalToken);
  u.searchParams.set("f", "json");
  const r = await fetch(u);
  if (!r.ok) throw new Error("Portal could not check your session.");
  const me = await r.json();
  if (me.error) throw new Error("Portal session expired. Please sign in again.");
  if (!me.username) throw new Error("Portal did not return your account.");
  const username = me.username as string;
  const isAdmin = me.role === "org_admin" || username === OWNER;
  return { username, fullName: me.fullName || username, portalRole: me.role, isAdmin, role: isAdmin ? "admin" : "viewer", stations: [] };
}

const shape = (r: any) => ({
  ...(r.attrs ?? {}),
  objectid: r.id,
  data_source: r.data_source,
  is_deleted: r.is_deleted ? 1 : 0,
  created_user: r.created_user,
  created_date: r.created_date,
  last_edited_user: r.last_edited_user,
  last_edited_date: r.last_edited_date,
  deleted_by: r.deleted_by,
  deleted_at: r.deleted_at,
});

async function handle(body: any, me: any) {
  const { action, model, key } = body ?? {};
  if (!CHAIN.has(model)) throw new Error("This table is not stored in Supabase; real farms and CWS stay on the Portal.");
  switch (action) {
    case "list":
      return (await db(`records?model=eq.${encodeURIComponent(model)}&is_deleted=eq.false&select=*`)).map(shape);
    case "count":
      return { count: (await db(`records?model=eq.${encodeURIComponent(model)}&is_deleted=eq.false&select=id`)).length };
    case "get": {
      const [row] = await db(
        `records?model=eq.${encodeURIComponent(model)}&rec_key=eq.${encodeURIComponent(key)}&is_deleted=eq.false&select=*`,
      );
      return row ? shape(row) : null;
    }
    case "create": {
      const now = new Date().toISOString();
      const [row] = await db("records", {
        method: "POST",
        body: JSON.stringify({
          model, rec_key: key, attrs: body.attrs ?? {},
          data_source: "recorded", created_user: me.username, created_date: now,
          last_edited_user: me.username, last_edited_date: now,
        }),
      });
      return shape(row);
    }
    case "update": {
      const now = new Date().toISOString();
      const [row] = await db(
        `records?model=eq.${encodeURIComponent(model)}&rec_key=eq.${encodeURIComponent(key)}&is_deleted=eq.false`,
        { method: "PATCH", body: JSON.stringify({
          attrs: body.attrs ?? {}, last_edited_user: me.username, last_edited_date: now,
        }) },
      );
      if (!row) throw new Error("Record no longer exists.");
      return shape(row);
    }
    case "softDelete": {
      const now = new Date().toISOString();
      await db(
        `records?model=eq.${encodeURIComponent(model)}&rec_key=eq.${encodeURIComponent(key)}`,
        { method: "PATCH", body: JSON.stringify({ is_deleted: true, deleted_by: me.username, deleted_at: now }) },
      );
      return true;
    }
    default:
      throw new Error(`Unknown data action: ${action}`);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const body = await req.json();
    const me = await identity(req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "");
    return new Response(JSON.stringify(ok(await handle(body, me))), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify(fail((e as Error).message)), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
