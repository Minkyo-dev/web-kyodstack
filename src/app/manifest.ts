import type { MetadataRoute } from "next";

/** Installable app (ADR 0043): needed for web push on iPhone (add to home screen). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kyod",
    short_name: "Kyod",
    description: "개인 플래너와 비서",
    start_url: "/scheduler",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    lang: "ko",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
