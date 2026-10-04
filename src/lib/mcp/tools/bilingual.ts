import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";
import { AUDIENCES, CATEGORIES, PRIORITIES, saveBilingualNotice, splitBilingual } from "@/lib/bilingual-notices";

const json = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }], structuredContent: JSON.parse(JSON.stringify(v)) as { [k: string]: string } });
const fail = (m: string) => ({ content: [{ type: "text" as const, text: m }], isError: true });

export const draftBilingualNotice = defineTool({
  name: "draft_bilingual_notice",
  title: "Draft bilingual circular",
  description:
    "Save a school circular in both English and Urdu. YOU write both versions: formal institutional English, and formal Urdu (Nastaliq script, respectful school-office register, e.g. 'والدین/سرپرست حضرات سے گزارش ہے'). Keep dates, amounts and names identical in both. Saved as a draft unless publish=true; gets the next CIR/YYYY/NNN number.",
  inputSchema: {
    title_en: z.string().trim().min(3).max(140),
    title_ur: z.string().trim().min(2).max(140),
    content_en: z.string().trim().min(10).max(6000),
    content_ur: z.string().trim().min(5).max(6000),
    category: z.enum(CATEGORIES).default("general"),
    audience: z.enum(AUDIENCES).default("all"),
    priority: z.enum(PRIORITIES).default("normal"),
    expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD after which it auto-archives."),
    publish: z.boolean().default(false).describe("false = draft for review (recommended)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    try {
      const notice = await saveBilingualNotice(supabaseForUser(ctx), input);
      return json({ saved: true, notice, note: notice.is_published ? "Published to the Notice Board." : "Saved as a draft on the Notice Board for review." });
    } catch (e) { return fail((e as Error).message); }
  },
});

export const getCircularForTranslation = defineTool({
  name: "get_circular_for_translation",
  title: "Get circular for translation",
  description: "Fetch an existing circular by reference number (e.g. CIR/2026/004) or title words, split into English and Urdu, so you can translate it and save a bilingual version with draft_bilingual_notice.",
  inputSchema: { query: z.string().trim().min(1) },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ query }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const sb = supabaseForUser(ctx);
    const q = query.replace(/[%,()]/g, " ");
    const { data, error } = await sb.from("notices")
      .select("reference_no, title, content, category, audience, priority, expires_at, is_published, published_at")
      .or(`reference_no.ilike.%${q}%,title.ilike.%${q}%`).order("published_at", { ascending: false }).limit(3);
    if (error) return fail(error.message);
    if (!data?.length) return fail("No circular matched.");
    return json({ circulars: data.map((n) => ({ ...n, ...splitBilingual(n.title, n.content) })) });
  },
});
