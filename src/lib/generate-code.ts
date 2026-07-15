// Generate a short code from a name's initials, then append a number
// to keep it unique against a list of existing codes.
export function generateCode(name: string, existing: string[] = []): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w));
  let initials = words
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
  if (!initials) initials = (name.replace(/[^a-z0-9]/gi, "").slice(0, 3) || "GEN").toUpperCase();

  const taken = new Set(existing.map((c) => c.toUpperCase()));
  let n = 1;
  while (taken.has(`${initials}${String(n).padStart(2, "0")}`)) n++;
  return `${initials}${String(n).padStart(2, "0")}`;
}
