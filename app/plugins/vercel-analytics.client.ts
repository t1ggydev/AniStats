import { inject } from "@vercel/analytics";

export default defineNuxtPlugin(() => {
  if (useRuntimeConfig().public.vercelAnalytics) inject({ framework: "nuxt" });
});
