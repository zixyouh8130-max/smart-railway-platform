// src/components/layout/DashboardCard.jsx

export default function DashboardCard({
  title,
  children,
}) {
  return (
    <div className="
          rounded-3xl
          border
          border-slate-100
          bg-white
          p-6
          shadow-sm
          transition
          hover:shadow-md
          "
        >
      <h2 className="mb-5 text-lg font-semibold text-white">
        {title}
      </h2>

      {children}

    </div>
  );
}