export default defineEventHandler(async (event) => {
  if (process.env.ANISTATS_AUTH_DISABLED === 'true') {
    throw createError({ statusCode: 503, statusMessage: 'OAuth is disabled in this isolated test environment' });
  }
  const config = useRuntimeConfig();

  const url = new URL("https://anilist.co/api/v2/oauth/authorize");
  url.searchParams.set("client_id", config.anilistClientId);
  url.searchParams.set("redirect_uri", config.anilistRedirectUri);
  url.searchParams.set("response_type", "code");

  return sendRedirect(event, url.toString());
});
