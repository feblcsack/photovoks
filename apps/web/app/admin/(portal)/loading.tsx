/** Instant skeleton while a portal page streams in (no blank wait after PIN login). */
export default function PortalLoading() {
  return (
    <div aria-busy="true" aria-label="Memuat">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <div className="skeleton h-8 w-48 rounded-[8px]" />
          <div className="skeleton mt-2 h-4 w-72 rounded-[6px]" />
        </div>
        <div className="skeleton h-10 w-36 rounded-[12px]" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-24 rounded-panel" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="skeleton h-80 rounded-panel" />
        <div className="skeleton h-80 rounded-panel" />
      </div>
    </div>
  );
}
