// Semantic chart color palette — maps to CSS vars defined in globals.css design tokens.
// Use these string values in recharts fill/stroke props.

export const CHART_COLORS = {
  primary: "hsl(var(--primary))",
  secondary: "hsl(var(--secondary))",
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  destructive: "hsl(var(--destructive))",
  info: "hsl(var(--info))",
  muted: "hsl(var(--muted-foreground))",
} as const

// Ordered palette for multi-series charts (6 distinct colors)
export const PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--info))",
  "hsl(var(--destructive))",
  "hsl(var(--muted-foreground))",
] as const

// Status → color mapping (consistent with StatusBadge tokens)
export const STATUS_COLORS: Record<string, string> = {
  DRAFT:           "hsl(var(--muted-foreground))",
  SUBMITTED:       "hsl(var(--info))",
  APPROVED:        "hsl(var(--success))",
  ACTIVE:          "hsl(var(--success))",
  IN_PROGRESS:     "hsl(var(--primary))",
  COMPLETED:       "hsl(var(--success))",
  CLOSED:          "hsl(var(--muted-foreground))",
  CANCELLED:       "hsl(var(--destructive))",
  REJECTED:        "hsl(var(--destructive))",
  BLOCKED:         "hsl(var(--destructive))",
  AT_RISK:         "hsl(var(--warning))",
  BREACHED:        "hsl(var(--destructive))",
  ON_TIME:         "hsl(var(--success))",
  POSTED:          "hsl(var(--success))",
  PARTIALLY_PAID:  "hsl(var(--warning))",
  PAID:            "hsl(var(--success))",
}
