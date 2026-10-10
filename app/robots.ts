import type { MetadataRoute } from "next";

/** The CRM is private: keep crawlers out of everything except the inquiry form and booking pages (manage links are noindex). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/f/", "/book"], disallow: ["/"] }],
  };
}
