import { cn } from "@diagram-tool/web-ui";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

/**
 * The editor's own chrome primitives.
 *
 * Deliberately local rather than `@diagram-tool/web-ui`: the shared components
 * are built against the app's shadcn tokens and carry `dark:` variants keyed to
 * `.dark` on `<html>`, which the app shell sets globally. The editor runs its
 * own chrome theme on its own root, so a shared button inside it would follow
 * the app's theme and not the editor's. These read `--ed-*` and nothing else.
 *
 * Keep them boring. Anything with real behaviour — the toolbar, the palette
 * card, the tabs — lives in its own file; this is the flat vocabulary they
 * share so a radius or a focus ring is defined once.
 */

const FOCUS =
  "outline-none focus-visible:shadow-[var(--ed-focus-ring)] focus-visible:border-ed-accent";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-ed-accent text-ed-accent-fg border-transparent hover:brightness-110",
  secondary: "bg-ed-surface text-ed-text border-ed-border hover:bg-ed-surface-hover",
  ghost: "bg-transparent text-ed-text border-transparent hover:bg-ed-surface-hover",
  danger: "bg-transparent text-ed-danger border-transparent hover:bg-ed-danger-quiet",
};

interface EditorButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function EditorButton({
  variant = "secondary",
  className,
  type = "button",
  ...props
}: EditorButtonProps) {
  return (
    <button
      // eslint-disable-next-line react/button-has-type
      type={type}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] border px-2.5",
        "text-[13px] font-medium transition-colors duration-[140ms]",
        "disabled:pointer-events-none disabled:opacity-45",
        "[&_svg]:size-[15px] [&_svg]:shrink-0",
        BUTTON_VARIANTS[variant],
        FOCUS,
        className,
      )}
      {...props}
    />
  );
}

export function EditorInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-[8px] border border-ed-border bg-ed-field px-2.5",
        "text-[13px] text-ed-text placeholder:text-ed-text-3 transition-colors duration-[140ms]",
        FOCUS,
        className,
      )}
      {...props}
    />
  );
}

export function EditorSelect({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-[8px] border border-ed-border bg-ed-field px-2",
        "text-[13px] text-ed-text transition-colors duration-[140ms]",
        FOCUS,
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

/** The uppercase 11px section marker: `TILES`, `NODE`, `EMOJI FALLBACK`. */
export function MicroLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "text-[11px] font-medium tracking-[0.06em] text-ed-text-3 uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Mono, for the values a config actually contains: ids, keys, numbers. */
export function MonoText({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono", className)}>{children}</span>;
}
