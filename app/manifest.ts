import type { MetadataRoute } from "next";
import { APP_NAME, STUDIO_NAME } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: `Leads, pipeline, inbox and bookings for ${STUDIO_NAME}`,
    start_url: "/",
    display: "standalone",
    background_color: "#F9FAFB",
    theme_color: "#1570EF",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
