import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RHIPO Studio",
    short_name: "RHIPO",
    description: "Leads, pipeline, inbox and bookings for RHIPO Photography & Cinematography",
    start_url: "/",
    display: "standalone",
    background_color: "#12100d",
    theme_color: "#17140f",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
