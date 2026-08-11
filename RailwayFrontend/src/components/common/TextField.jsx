import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function TextField({
  label,
  name,
  type = "text",
  placeholder,
  register,
  error,
  icon: Icon,
}) {
  return (
    <div className="space-y-2">
      <Label
        htmlFor={name}
        className="text-sm font-medium text-slate-700"
      >
        {label}
      </Label>

      <div className="relative">
        {Icon && (
          <Icon
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
        )}

        <Input
          id={name}
          type={type}
          placeholder={placeholder}
          {...register(name)}
          className={`
            h-12
            rounded-xl
            border-slate-200
            bg-slate-50
            shadow-none
            transition-all
            focus:border-blue-500
            focus:ring-2
            focus:ring-blue-500/20
            ${Icon ? "pl-11" : ""}
          `}
        />
      </div>

      {error && (
        <p className="text-sm text-red-500">
          {error.message}
        </p>
      )}
    </div>
  );
}