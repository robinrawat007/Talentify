import fs from "fs";
import { createGzip } from "zlib";
import { promisify } from "util";

const PROJECT_REF = "rgzsifpftjyicwlwkzlo";
const ACCESS_TOKEN = "sbp_1c5f82e55a24284b39cffeb816ff05ead9cd5c68";
const FUNCTION_NAME = "analyze-profile";

const body = fs.readFileSync("supabase/functions/analyze-profile/index.ts", "utf8");
console.log("File read OK, length:", body.length);

// First, check if function exists
const checkRes = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/${FUNCTION_NAME}`,
  {
    method: "GET",
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  }
);
console.log("Check status:", checkRes.status);

const method = checkRes.status === 404 ? "POST" : "PATCH";
const endpoint = checkRes.status === 404
  ? `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`
  : `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/${FUNCTION_NAME}`;

console.log(`Using ${method} → ${endpoint}`);

const res = await fetch(endpoint, {
  method,
  headers: {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    slug: FUNCTION_NAME,
    name: FUNCTION_NAME,
    verify_jwt: false,
    body: body,
  }),
});

const text = await res.text();
console.log("Status:", res.status);
if (res.ok) {
  console.log("SUCCESS: Function deployed!");
  console.log("URL: https://rgzsifpftjyicwlwkzlo.supabase.co/functions/v1/analyze-profile");
} else {
  console.error("FAILED:", text);
}
