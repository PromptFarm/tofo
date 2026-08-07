interface CoreProblemCardProps {
  content: string;
}

export function CoreProblemCard({ content }: CoreProblemCardProps) {
  return (
    <div className="bg-surface-low rounded-lg p-6">
      <div className="flex gap-3">
        <div className="w-[3px] shrink-0 rounded-full bg-primary" />
        <div>
          <h3 className="font-display font-semibold text-on-surface">
            The Core Problem
          </h3>
          <p className="text-sm text-on-surface-variant leading-relaxed mt-2">
            {content}
          </p>
        </div>
      </div>
    </div>
  );
}
