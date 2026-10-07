export type AppEntry = {
  package: string;
  label: string;
  category: "social" | "banking" | "streaming" | "dev" | "system" | "gaming";
  emoji: string;
  recommended: "proxy" | "direct" | "block";
  why: string;
};

/** Representative Android packages used by the split-tunnel picker. */
export const APP_CATALOG: AppEntry[] = [
  { package: "com.android.chrome", label: "Chrome", category: "system", emoji: "🌐", recommended: "proxy", why: "Browsing usually wants the tunnel for unblocked search results." },
  { package: "com.google.android.youtube", label: "YouTube", category: "streaming", emoji: "▶️", recommended: "proxy", why: "Video CDNs benefit from the tunnel if your ISP throttles them." },
  { package: "org.telegram.messenger", label: "Telegram", category: "social", emoji: "✈️", recommended: "proxy", why: "Messenger traffic benefits most when the local network blocks it." },
  { package: "com.whatsapp", label: "WhatsApp", category: "social", emoji: "💬", recommended: "direct", why: "Call quality is better direct — proxying adds jitter." },
  { package: "com.instagram.android", label: "Instagram", category: "social", emoji: "📸", recommended: "proxy", why: "Media-heavy social feeds are commonly throttled." },
  { package: "com.digikala.app", label: "Digikala", category: "system", emoji: "🛍️", recommended: "direct", why: "Domestic shopping apps must stay direct or payments break." },
  { package: "com.bank.mellat", label: "Bank Mellat", category: "banking", emoji: "🏦", recommended: "direct", why: "Banks reject requests coming from datacentre IPs." },
  { package: "com.bank.saderat", label: "Bank Saderat", category: "banking", emoji: "🏦", recommended: "direct", why: "Banking sessions frequently validate the source network." },
  { package: "com.spotify.music", label: "Spotify", category: "streaming", emoji: "🎧", recommended: "proxy", why: "Catalog differences depend on the egress country." },
  { package: "com.netflix.mediaclient", label: "Netflix", category: "streaming", emoji: "🍿", recommended: "direct", why: "Proxy egress IPs are usually blocked by streaming platforms." },
  { package: "com.github.android", label: "GitHub", category: "dev", emoji: "🐙", recommended: "proxy", why: "Registry and Git traffic is faster and more consistent through the proxy." },
  { package: "com.termux", label: "Termux", category: "dev", emoji: "⌨️", recommended: "proxy", why: "Package mirrors speed up through a stable egress." },
  { package: "com.tencent.ig", label: "PUBG Mobile", category: "gaming", emoji: "🎮", recommended: "direct", why: "Realtime gaming needs the lowest jitter — keep it off the tunnel." },
  { package: "com.activision.callofduty.shooter", label: "Call of Duty", category: "gaming", emoji: "🎯", recommended: "direct", why: "Matchmaking latency punishes extra hops." },
  { package: "com.google.android.gms", label: "Google Play services", category: "system", emoji: "⚙️", recommended: "proxy", why: "Push and location services behave best through a stable path." },
  { package: "ir.aparat", label: "Aparat", category: "streaming", emoji: "🎬", recommended: "direct", why: "Domestic CDN already has the shortest path." },
];

export const APP_CATEGORIES = ["social", "banking", "streaming", "dev", "gaming", "system"] as const;

export const APP_BUNDLES: { id: string; name: string; description: string; action: "proxy" | "direct" | "block"; categories: string[]; emoji: string }[] = [
  { id: "banking-direct", name: "Banks & payments direct", description: "Keeps every banking app off the tunnel so 3-D Secure callbacks survive.", action: "direct", categories: ["banking"], emoji: "🏦" },
  { id: "gaming-direct", name: "Gaming direct", description: "Realtime games bypass the tunnel to protect latency and jitter.", action: "direct", categories: ["gaming"], emoji: "🎮" },
  { id: "social-proxy", name: "Social through the tunnel", description: "Messengers and social feeds ride the proxy for reachability.", action: "proxy", categories: ["social"], emoji: "💬" },
  { id: "domestic-direct", name: "Domestic apps direct", description: "Local services keep the ISP path so they stay fast and functional.", action: "direct", categories: ["streaming"], emoji: "🇮🇷" },
];
