// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: process.env.NODE_ENV !== 'production' },
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  runtimeConfig: {
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || "http://localhost:3000",
      siteName: "AniStats",
      vercelAnalytics: process.env.VERCEL === '1'
    },
    anilistClientId: process.env.ANILIST_CLIENT_ID,
    anilistClientSecret: process.env.ANILIST_CLIENT_SECRET,
    anilistRedirectUri: process.env.ANILIST_REDIRECT_URI,
    debug: process.env.DEBUG === "true"
  }
});
