import { createClient } from "@supabase/supabase-js";

// Operator-only tape client. Requests go to <origin>/tape/rest/v1/<table>;
// the server-side proxy injects the real credentials. The "proxy" key is a
// placeholder only — no anon key, env key, or the main app client is used here.
export const tapeClient = createClient(window.location.origin + "/tape", "proxy");
