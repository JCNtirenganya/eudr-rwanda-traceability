// One Edge Function for the whole app. The Portal token is the only credential the browser sends.
// This function validates it against Portal, then talks to Postgres with the service key.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SB = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTAL = Deno.env.get("PORTAL_URL") ?? "https://gis.naeb.gov.rw/portal";
const OWNER = Deno.env.get("PORTAL_OWNER") ?? "Coffee_Trace";
const PII: Record<string, string[]> = {
  farm_recorded: ["farmer_name", "national_id", "phone"],
  station_recorded: ["telephone", "f_email", "phone"],
  farmer_recorded: ["full_name", "phone"],
};

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
  const username = me.username as string;
  const profile = (await db(`profiles?portal_username=eq.${encodeURIComponent(username)}&select=*`))?.[0] ?? {};
  const assigned = await db(
    `records?model=eq.user_assignment&is_deleted=eq.false&attrs->>username=eq.${encodeURIComponent(username)}&select=attrs`,
  );
  const stations: string[] = profile.stations?.length
    ? profile.stations
    : (assigned ?? []).map((a: any) => a.attrs?.cws_id).filter(Boolean);
  const isAdmin = profile.role === "admin" || me.role === "org_admin" || username === OWNER;
  const role = isAdmin ? "admin" : stations.length ? "editor" : "viewer";
  return { username, fullName: me.fullName || username, portalRole: me.role, isAdmin, role, stations };
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
  ...(r.geometry ? { geometry: r.geometry } : {}),
});

const scrubbing = (model: string, attrs: any) => {
  const out = { ...(attrs ?? {}) };
  for (const k of PII[model] ?? []) delete out[k];
  return out;
};

async function handle(body: any, me: any) {
  const { action, model, key } = body ?? {};
  switch (action) {
    case "me":
      return me;
    case "meta": {
      const [m] = await db("source_meta?select=*");
      return {
        convField: m?.conv_field ?? "",
        farmMeta: m?.farm_meta ?? {},
        stationMeta: m?.station_meta ?? {},
        syncedAt: m?.synced_at ?? null,
      };
    }
    case "sources": {
      const [m, farms, stations] = await Promise.all([
        db("source_meta?select=*"),
        db("source_farms?active=eq.true&select=attrs,geometry"),
        db("source_stations?active=eq.true&select=attrs,geometry"),
      ]);
      return {
        farms: (farms ?? []).map((f: any) => ({ attributes: f.attrs, geometry: f.geometry })),
        stations: (stations ?? []).map((s: any) => ({ attributes: s.attrs, geometry: s.geometry })),
        farmFields: (m?.[0]?.farm_meta?.fields ?? []).map((f: any) => f.name),
        convField: m?.[0]?.conv_field ?? "",
        syncedAt: m?.[0]?.synced_at ?? null,
      };
    }
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
      if (!me.isAdmin && model === "user_assignment") throw new Error("Only admins can change station assignments.");
      const now = new Date().toISOString();
      const [row] = await db("records", {
        method: "POST",
        body: JSON.stringify({
          model, rec_key: key, attrs: scrubbing(model, body.attrs), geometry: body.geometry ?? null,
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
          attrs: scrubbing(model, body.attrs), geometry: body.geometry ?? null,
          last_edited_user: me.username, last_edited_date: now,
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
