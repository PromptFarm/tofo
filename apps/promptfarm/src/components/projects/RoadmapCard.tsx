interface Step {
  title: string;
  description: string;
}

interface RoadmapCardProps {
  steps: Step[];
}

export function RoadmapCard({ steps }: RoadmapCardProps) {
  return (
    <div>
      <h3 className="font-display font-semibold text-on-surface text-lg mb-5">
        Architectural Roadmap
      </h3>
      <div className="space-y-5">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-4 items-start">
            <div className="w-7 h-7 shrink-0 rounded-full bg-primary-fixed-dim flex items-center justify-center">
              <span className="text-xs font-semibold text-primary">
                {i + 1}
              </span>
            </div>
            <div>
              <h4 className="font-display font-semibold text-on-surface text-sm">
                {step.title}
              </h4>
              <p className="text-sm text-on-surface-variant leading-relaxed mt-0.5">
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
