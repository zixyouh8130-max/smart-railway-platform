import { TrainFront } from "lucide-react";

export default function Logo({ dark = false }) {
  return (
    <div className="flex items-center gap-4">

      <div
        className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg ${
          dark
            ? "bg-white text-blue-700"
            : "bg-blue-600 text-white"
        }`}
      >
        <TrainFront size={30} />
      </div>

      <div>

        <h1
          className={`text-3xl font-bold ${
            dark
              ? "text-white"
              : "text-slate-900"
          }`}
        >
          Smart Railway
        </h1>

        <p
          className={`mt-1 ${
            dark
              ? "text-blue-100"
              : "text-slate-500"
          }`}
        >
          Ticketing System
        </p>

      </div>

    </div>
  );
}