export default function PageHeader({
  title,
  subtitle,
}) {
  return (
    <div className="space-y-3 text-center">

      <h1 className="text-4xl font-bold tracking-tight text-slate-900">
        {title}
      </h1>

      <p className="text-slate-500 leading-relaxed">
        {subtitle}
      </p>

    </div>
  );
}