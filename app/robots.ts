import type { MetadataRoute } from "next";

/** The CRM is private: keep crawlers out of everything except the public home page, policies, inquiry form and booking pages (manage links are noindex). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/$", "/welcome", "/privacy", "/terms", "/f/", "/book"], disallow: ["/"] }],
  };
}
