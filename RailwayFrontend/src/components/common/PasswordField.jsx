import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PasswordField({
  label,
  name,
  register,
  error,
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="space-y-2">

      <Label
        htmlFor={name}
        className="text-sm font-medium text-slate-700"
      >
        {label}
      </Label>

      <div className="relative">

        <Lock
          size={18}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
        />

        <Input
          id={name}
          type={show ? "text" : "password"}
          {...register(name)}
          className="
            h-12
            rounded-xl
            bg-slate-50
            pl-11
            pr-12
            border-slate-200
            focus:border-blue-500
            focus:ring-2
            focus:ring-blue-500/20
          "
        />

        <button
          type="button"
          onClick={() => setShow(!show)}
          className="
            absolute
            right-4
            top-1/2
            -translate-y-1/2
            text-slate-400
            hover:text-blue-600
            transition
          "
        >
          {show ? (
            <EyeOff size={18} />
          ) : (
            <Eye size={18} />
          )}
        </button>

      </div>

      {error && (
        <p className="text-sm text-red-500">
          {error.message}
        </p>
      )}

    </div>
  );
}