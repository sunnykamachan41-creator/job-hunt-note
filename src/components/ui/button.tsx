type ButtonTone = "primary" | "secondary" | "danger";

const toneClasses: Record<ButtonTone, string> = {
  primary: "border-brand bg-brand text-white hover:bg-blue-700",
  secondary: "border-line bg-white text-ink hover:bg-slate-50",
  danger: "border-red-200 bg-white text-red-600 hover:bg-red-50"
};

export function Button({
  children,
  tone = "secondary",
  className = "",
  disabled = false
}: {
  children: React.ReactNode;
  tone?: ButtonTone;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 ${toneClasses[tone]} ${className}`}
    >
      {children}
    </button>
  );
}
