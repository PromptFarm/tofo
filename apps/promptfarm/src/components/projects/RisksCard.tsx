import { AlertTriangle, ArrowRight } from "lucide-react";

interface RisksCardProps {
  risks: string[];
}

export function RisksCard({ risks }: RisksCardProps) {
  return (
    <div className="bg-surface-low rounded-xl p-6">
      <h3 className="font-display font-semibold text-on-surface text-lg mb-4">
        Strategic Risks
      </h3>
      <div className="space-y-3">
        {risks.map((risk, i) => (
          <div key={i} className="flex gap-2.5 items-start">
            <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-on-surface-variant leading-relaxed">
              {risk}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <a
          href="#"
          className="flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface transition-all duration-200 ease-out"
        >
          View Full Mitigation Plan
          <ArrowRight size={14} />
        </a>
      </div>
    </div>
  );
}
