type BadgeTone = "blue" | "green" | "red" | "amber" | "yellow" | "purple" | "violet" | "slate";

const toneClasses: Record<BadgeTone, string> = {
  blue: "bg-blue-100 text-blue-700",
  green: "bg-green-100 text-green-700",
  red: "bg-red-100 text-red-600",
  amber: "bg-amber-100 text-amber-700",
  yellow: "bg-yellow-100 text-yellow-700",
  purple: "bg-purple-100 text-purple-700",
  violet: "bg-violet-100 text-violet-700",
  slate: "bg-slate-100 text-slate-600"
};

export function Badge({
  children,
  tone = "slate",
  className = ""
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center rounded-full px-2 text-xs font-semibold ${toneClasses[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function statusBadgeTone(status: string): BadgeTone {
  if (status === "予定" || status === "選考中") return "blue";
  if (status === "検討中") return "slate";
  if (status === "結果待ち") return "yellow";
  if (status === "通過") return "green";
  if (status === "落選") return "red";
  if (status === "辞退") return "amber";
  if (status === "保留") return "slate";
  if (status === "内定") return "violet";
  return "slate";
}
