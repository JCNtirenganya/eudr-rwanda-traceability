// Portal is the login and the home of real farms, farmers and CWS. Supabase holds chain records only.
// Set the two Supabase values after creating the project. Use the public anon/publishable key here;
// the service-role key belongs only in the Edge Function environment.
export const CFG = {
  PORTAL: "https://gis.naeb.gov.rw/portal",
  CWS_URL: "https://gis.naeb.gov.rw/server/rest/services/Hosted/Coffee_Washing_Station/FeatureServer/0",
  FARMS_URL: "https://gis.naeb.gov.rw/portal/sharing/servers/63a787f80563400fa9e46af7f006d714/rest/services/EUDR_Data/FeatureServer/0", // preferred; the app discovers the readable polygon layer
  CONVERSION_FIELD: "",          // empty = detect the "converted to farmland" field automatically
  OWNER: "Coffee_Trace",
  SUPABASE_URL: "https://YOUR_PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY",
  API_URL: "",                   // empty = SUPABASE_URL + "/functions/v1/api"
  DEMO_CHAIN: true,              // true: chain records are indicative; farms/farmers/CWS are live from Portal
  MIN_CHERRY_PRICE: 800,         // RWF/kg, set by NAEB per season
};
