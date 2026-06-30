export default function StockLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="h-8 w-32 bg-surface rounded-lg" />
          <div className="h-4 w-48 bg-surface rounded mt-2" />
        </div>
      </div>

      {/* Tabs */}
      <div className="h-10 w-64 bg-surface rounded-lg mb-6" />

      {/* Overview skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-72 bg-surface rounded-xl" />
        <div className="h-72 bg-surface rounded-xl" />
      </div>
      <div className="h-48 bg-surface rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-64 bg-surface rounded-xl" />
        <div className="h-64 bg-surface rounded-xl" />
      </div>
      <div className="h-32 bg-surface rounded-xl" />
      <div className="h-48 bg-surface rounded-xl" />
    </div>
  );
}
