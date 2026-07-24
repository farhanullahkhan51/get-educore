// Curated list of 50 Google Fonts available for tenant branding.
export const GOOGLE_FONTS: string[] = [
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Raleway",
  "Nunito", "Nunito Sans", "Source Sans 3", "Work Sans", "Rubik", "Karla",
  "Manrope", "DM Sans", "Plus Jakarta Sans", "Figtree", "Outfit", "Urbanist",
  "Sora", "Space Grotesk", "IBM Plex Sans", "Fira Sans", "Mulish", "Barlow",
  "Oxygen", "Cabin", "Hind", "PT Sans", "Noto Sans", "Josefin Sans", "Quicksand",
  "Archivo", "Assistant", "Bitter", "Merriweather", "Playfair Display",
  "Lora", "PT Serif", "Cormorant Garamond", "EB Garamond", "Libre Baskerville",
  "Crimson Pro", "Fraunces", "Source Serif 4", "DM Serif Display",
  "Instrument Serif", "JetBrains Mono", "Fira Code", "Space Mono",
];

const loaded = new Set<string>();

/** Inject a Google Fonts stylesheet for the given family (idempotent). */
export function loadGoogleFont(family: string) {
  if (typeof document === "undefined" || !family || loaded.has(family)) return;
  loaded.add(family);
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
    family,
  )}:wght@400;500;600;700&display=swap`;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.googleFont = family;
  document.head.appendChild(link);
}
