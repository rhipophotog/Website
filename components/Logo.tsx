import { APP_NAME } from "@/lib/brand";

/**
 * "Focus rings" mark (brand/logo-mark.svg, inlined) with optional wordmark (BRAND.md §1).
 * Wordmark: Manrope 800, -0.4px tracking; gap ≈ 0.35 × mark size.
 */
export function Logo({
  size = 32,
  variant = "mark",
  tone = "light",
  className = "",
}: {
  size?: number;
  variant?: "mark" | "full";
  tone?: "light" | "dark";
  className?: string;
}) {
  const mark = (
    <svg viewBox="0 0 512 512" width={size} height={size} role={variant === "mark" ? "img" : undefined} aria-label={variant === "mark" ? APP_NAME : undefined} aria-hidden={variant === "full" ? true : undefined}>
      <rect width="512" height="512" rx="116" fill="#1570EF" />
      <path d="M375.5 155.7A156 156 0 1 1 202.6 109.4" fill="none" stroke="#32D583" strokeWidth="20" strokeLinecap="round" />
      <path d="M359.4 218.4A110 110 0 1 1 256.0 146.0" fill="none" stroke="#FFFFFF" strokeWidth="20" strokeLinecap="round" />
      <path d="M320.0 256.0A64 64 0 1 1 277.9 195.9" fill="none" stroke="#FDB022" strokeWidth="20" strokeLinecap="round" />
      <circle cx="256" cy="256" r="24" fill="#FFFFFF" />
    </svg>
  );
  if (variant === "mark") return <span className={`inline-flex shrink-0 ${className}`}>{mark}</span>;
  return (
    <span className={`inline-flex items-center ${className}`} style={{ gap: Math.round(size * 0.35) }}>
      {mark}
      <span
        className={`font-display font-extrabold ${tone === "dark" ? "text-white" : "text-gray-900"}`}
        style={{ fontSize: Math.round(size * 0.56), letterSpacing: "-0.4px", lineHeight: 1 }}
      >
        {APP_NAME}
      </span>
    </span>
  );
}
