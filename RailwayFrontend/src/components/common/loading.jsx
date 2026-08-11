// src/components/common/Loading.jsx

import { LoaderCircle } from "lucide-react";

export default function Loading({
  text = "Loading...",
}) {
  return (
    <div className="flex items-center justify-center gap-3">
      <LoaderCircle className="animate-spin text-blue-600" />

      <span className="text-sm text-slate-500">
        {text}
      </span>
    </div>
  );
}