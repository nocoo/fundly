export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background animate-in fade-in duration-300">
      <div className="relative animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex h-40 w-40 items-center justify-center rounded-full bg-secondary ring-1 ring-border p-8">
          <img src="/logo.svg" alt="Fundly" width={80} height={80} className="h-20 w-20" />
        </div>
        <div className="absolute inset-[-4px] rounded-full border-[3px] border-transparent border-t-primary animate-spin" />
      </div>
    </div>
  );
}
