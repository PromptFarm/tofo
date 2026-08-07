"use client";

type PendingOperationBannerProps = {
  active: boolean;
  message: string | null;
};

export function PendingOperationBanner({
  active,
  message,
}: PendingOperationBannerProps) {
  if (!active || !message) {
    return null;
  }

  return (
    <div className="px-4 py-2 border-b border-[rgba(245,158,11,0.28)] bg-[rgba(245,158,11,0.12)]">
      <div className="flex items-center gap-2 text-[12px] text-[var(--on-surface-variant)]">
        <span className="w-[10px] h-[10px] rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin inline-block shrink-0" />
        <span>{message}</span>
      </div>
    </div>
  );
}
