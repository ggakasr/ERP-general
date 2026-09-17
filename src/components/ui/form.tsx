import * as React from "react"
import { cn } from "@/lib/utils"

const control =
  "w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(control, "h-9", className)} {...props} />
)
Input.displayName = "Input"

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(control, "min-h-[72px] py-2", className)} {...props} />
)
Textarea.displayName = "Textarea"

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(control, "h-9 pr-8", className)} {...props}>
      {children}
    </select>
  )
)
Select.displayName = "Select"

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-medium text-muted-foreground", className)} {...props} />
}

export function Field({
  label, required, hint, children, className,
}: { label: string; required?: boolean; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label>
        {label}
        {required && <span className="text-red-600"> *</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
