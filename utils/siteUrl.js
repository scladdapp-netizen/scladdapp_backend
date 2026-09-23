const publicBaseUrl = () =>
  String(
    process.env.APP_URL ||
      process.env.DEV_BASE_URL ||
      `http://localhost:${process.env.PORT || 1234}`,
  ).replace(/\/$/, "");

const buildSiteUrl = (slug) => `${publicBaseUrl()}/sites/${slug}`;

// Published sites are served at {APP_URL}/sites/<slug>. A URL saved while
// developing still has localhost; swap that host for the env backend.
const rewriteStoredSiteUrl = (storedUrl) => {
  if (!storedUrl) return storedUrl;
  try {
    const url = new URL(storedUrl);
    if (!url.pathname.startsWith("/sites/")) return storedUrl;
    const path = url.pathname.replace(/\/$/, "");
    return `${publicBaseUrl()}${path}${url.search}${url.hash}`;
  } catch (_) {
    return storedUrl;
  }
};

module.exports = { publicBaseUrl, buildSiteUrl, rewriteStoredSiteUrl };
