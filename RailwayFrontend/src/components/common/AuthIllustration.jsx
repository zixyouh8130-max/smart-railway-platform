import {
  ArrowRight,
  Calendar,
  MapPin,
  Ticket,
  TrainFront,
} from "lucide-react";

export default function AuthIllustration() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">

      {/* Decorative circles */}
      <div className="absolute left-20 top-10 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute bottom-10 right-10 h-80 w-80 rounded-full bg-cyan-300/10 blur-3xl" />

      {/* Train */}
      <div className="relative z-10">

        <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-3xl bg-white text-blue-600 shadow-2xl">
          <TrainFront size={60} />
        </div>

        {/* Railway */}
        <div className="mt-10 flex justify-center">

          <div className="relative w-72">

            <div className="h-2 rounded-full bg-white/30" />

            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="absolute top-[-5px] h-5 w-1 rounded bg-white/50"
                style={{
                  left: `${i * 28}px`,
                }}
              />
            ))}

          </div>

        </div>

      </div>

      {/* Floating Booking Card */}
      <div className="absolute left-0 top-24 w-64 rounded-3xl border border-white/20 bg-white/10 p-5 backdrop-blur-xl">

        <div className="flex items-center gap-3">

          <MapPin className="text-cyan-200" />

          <div>

            <p className="text-sm text-blue-100">
              Route
            </p>

            <h3 className="font-semibold">
              Yangon
              <ArrowRight className="mx-1 inline" size={16} />
              Mandalay
            </h3>

          </div>

        </div>

      </div>

      {/* Ticket */}
      <div className="absolute right-0 top-48 w-64 rounded-3xl border border-white/20 bg-white/10 p-5 backdrop-blur-xl">

        <div className="flex items-center gap-3">

          <Ticket className="text-green-300" />

          <div>

            <p className="text-sm text-blue-100">
              Seat
            </p>

            <h3 className="font-semibold">
              Coach B • A12
            </h3>

          </div>

        </div>

      </div>

      {/* Date */}
      <div className="absolute bottom-20 left-16 w-72 rounded-3xl border border-white/20 bg-white/10 p-5 backdrop-blur-xl">

        <div className="flex items-center gap-3">

          <Calendar className="text-yellow-300" />

          <div>

            <p className="text-sm text-blue-100">
              Departure
            </p>

            <h3 className="font-semibold">
              15 Aug 2026 • 08:00 AM
            </h3>

          </div>

        </div>

      </div>

    </div>
  );
}