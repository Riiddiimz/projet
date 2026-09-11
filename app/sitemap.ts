import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://gcol.vercel.app";
  return [{ url: base, changeFrequency: "weekly", priority: 1 }];
}
