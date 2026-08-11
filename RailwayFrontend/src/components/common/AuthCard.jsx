import { Card } from "@/components/ui/card";

export default function AuthCard({ children }) {
  return (
    <Card
      className="
        w-full
        max-w-lg
        rounded-[32px]
        border
        border-slate-200/70
        bg-white/95
        backdrop-blur-xl
        shadow-2xl
        p-10
      "
    >
      {children}
    </Card>
  );
}