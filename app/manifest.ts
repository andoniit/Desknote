import type { MetadataRoute } from "next";

const cream = "#FDFAF6";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DeskNote — little notes for two",
    short_name: "DeskNote",
    description:
      "A private couple message board. Leave notes on each other's desk, anywhere in the world.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: cream,
    theme_color: cream,
    categories: ["social", "lifestyle", "productivity"],
    lang: "en",
    dir: "ltr",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
