import type { MetadataRoute } from "next";

/** The CRM is private: keep crawlers out of everything except the public inquiry form. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/f/"], disallow: ["/"] }],
  };
}
