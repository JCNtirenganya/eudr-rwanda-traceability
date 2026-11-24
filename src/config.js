// Portal stays the app's login and the home of personal data. Supabase holds everything the app records.
// Set the two Supabase values below after creating the project. Use the public anon/publishable key
// here; the service role key belongs only in GitHub Secrets and the Edge Function environment.
export const CFG = {
  PORTAL: "https://gis.naeb.gov.rw/portal",
  CWS_URL: "https://gis.naeb.gov.rw/server/rest/services/Hosted/Coffee_Washing_Station/FeatureServer/0",
  FARMS_ITEM_ID: "63a787f80563400fa9e46af7f006d714", FARMS_LAYER: 0,
  FARMS_URL: "",                 // optional full .../FeatureServer/0 URL (otherwise resolved from the portal item)
  CONVERSION_FIELD: "",          // exact "forest converted to farmland" field; empty = detect "conver"
  OWNER: "Coffee_Trace",
  FOLDER: "Trace", TAG: "eudr-trace",  // only used by the retired portal publisher
  SUPABASE_URL: "https://YOUR_PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY",
  API_URL: "",                   // empty = SUPABASE_URL + "/functions/v1/api"
  OFFLINE_DEMO: true,            // temporary: require Portal sign-in, then open with indicative data (no Supabase)
  MIN_CHERRY_PRICE: 800,         // NAEB minimum cherry price (RWF/kg), set by NAEB per season
};
