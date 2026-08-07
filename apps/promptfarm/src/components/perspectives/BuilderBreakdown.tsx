import { Expand } from "lucide-react";

interface BreakdownStep {
  title: string;
  description: string;
}

interface BuilderBreakdownProps {
  title: string;
  subtitle: string;
  reasoning: string;
  steps: BreakdownStep[];
}

export function BuilderBreakdown({
  title,
  subtitle,
  reasoning,
  steps,
}: BuilderBreakdownProps) {
  return (
    <div className="bg-surface-lowest rounded-xl p-6 shadow-[0_2px_12px_rgba(42,52,57,0.06)]">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="font-display font-bold text-on-surface text-xl">
            {title}
          </h2>
          <p className="text-sm text-on-surface-variant mt-0.5">{subtitle}</p>
        </div>
        <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-container transition-all duration-200 ease-out">
          <Expand size={16} className="text-on-surface-variant" />
        </button>
      </div>

      {/* Technical Reasoning */}
      <div className="mt-5">
        <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium">
          Technical Reasoning
        </span>
        <p className="text-sm text-on-surface leading-relaxed mt-2">
          {reasoning}
        </p>
      </div>

      {/* Steps */}
      <div className="mt-6 space-y-4">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-3 items-start">
            <div className="w-7 h-7 shrink-0 rounded-full bg-primary-fixed-dim flex items-center justify-center">
              <span className="text-xs font-semibold text-primary">
                {i + 1}
              </span>
            </div>
            <div>
              <h4 className="font-display font-semibold text-on-surface text-sm">
                {step.title}
              </h4>
              <p className="text-xs text-on-surface-variant leading-relaxed mt-0.5">
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom image placeholder */}
      <div className="mt-6 rounded-xl overflow-hidden aspect-video bg-slate-800 relative">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 60%, rgba(0,180,220,0.3) 0%, transparent 60%), linear-gradient(180deg, rgba(15,23,42,0.8) 0%, rgba(15,23,42,1) 100%)",
          }}
        />
      </div>
    </div>
  );
}
