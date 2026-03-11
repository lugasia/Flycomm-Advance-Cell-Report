export default function PlatformHeader() {
  return (
    <div className="flex items-center gap-2.5 group pointer-events-none">
      <img 
        src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b939476cddd8fbfb8aee4/70b5f92c5_flycomm_logo.png"
        alt="Flycomm"
        className="w-8 h-8 object-contain flex-shrink-0 brightness-200 invert opacity-90"
      />
      <div className="overflow-hidden">
        <p className="text-sm font-bold text-slate-100 tracking-tight leading-tight">FLYCOMM</p>
        <p className="text-[9px] text-slate-400 uppercase tracking-widest leading-tight">Spectral Awareness SOC</p>
      </div>
    </div>
  );
}