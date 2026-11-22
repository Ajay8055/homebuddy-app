const endpoint = process.env.HOMEBUDDY_AI_ENDPOINT || "https://tvprryuhxxwdirgtxssr.supabase.co/functions/v1/homebuddy-ai";

const unauthenticated = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "hello from unauthenticated smoke test" }),
});
if (unauthenticated.status !== 401) {
  throw new Error("Expected unauthenticated AI request to return 401, got " + unauthenticated.status);
}

const invalidToken = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": "Bearer invalid-test-token" },
  body: JSON.stringify({ message: "hello from invalid-token smoke test" }),
});
if (invalidToken.status !== 401) {
  throw new Error("Expected invalid bearer token to return 401, got " + invalidToken.status);
}

const preflight = await fetch(endpoint, {
  method: "OPTIONS",
  headers: { "Origin": "https://homebuddy-app-seven.vercel.app", "Access-Control-Request-Method": "POST" },
});
if (preflight.status !== 200) {
  throw new Error("Expected CORS preflight to return 200, got " + preflight.status);
}

process.stdout.write("HomeBuddy AI auth smoke tests passed (unauthenticated=401, invalid token=401, CORS preflight=200).\n");
