const publicBaseUrl = () =>
  String(
    process.env.APP_URL ||
      process.env.DEV_BASE_URL ||
      `http://localhost:${process.env.PORT || 1234}`,
  ).replace(/\/$/, "");

const siteDomain = () =>
  String(process.env.PROD_DOMAIN || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/^www\./, "");

const buildSiteUrl = (slug) => {
  const safe = String(slug || "").trim().toLowerCase();
  const domain = siteDomain();
  if (domain && safe) return `https://${safe}.${domain}`;
  return `${publicBaseUrl()}/sites/${safe}`;
};

// Older publishes saved {APP_URL}/sites/<slug>. Show the subdomain when
// PROD_DOMAIN is set, including for sites that are already published.
const rewriteStoredSiteUrl = (storedUrl) => {
  if (!storedUrl) return storedUrl;
  try {
    const url = new URL(storedUrl);
    const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    const slug = parts[0] === "sites" ? String(parts[1] || "").toLowerCase() : "";
    const domain = siteDomain();
    if (domain && slug) return `https://${slug}.${domain}`;
    if (!url.pathname.startsWith("/sites/")) return storedUrl;
    const path = url.pathname.replace(/\/$/, "");
    return `${publicBaseUrl()}${path}${url.search}${url.hash}`;
  } catch (_) {
    return storedUrl;
  }
};

module.exports = { publicBaseUrl, buildSiteUrl, rewriteStoredSiteUrl };
