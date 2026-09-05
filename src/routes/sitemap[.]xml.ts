import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const PATHS = ["/", "/pricing", "/inquire", "/signup", "/auth"];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const host = (request.headers.get("x-forwarded-host") || url.host).split(",")[0]!.trim();
        const proto = (request.headers.get("x-forwarded-proto") || url.protocol.replace(":", ""))
          .split(",")[0]!
          .trim();
        const base = `${proto}://${host}`;

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...PATHS.map((p) =>
            [
              `  <url>`,
              `    <loc>${base}${p}</loc>`,
              `    <changefreq>weekly</changefreq>`,
              `    <priority>${p === "/" ? "1.0" : "0.7"}</priority>`,
              `  </url>`,
            ].join("\n"),
          ),
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});
