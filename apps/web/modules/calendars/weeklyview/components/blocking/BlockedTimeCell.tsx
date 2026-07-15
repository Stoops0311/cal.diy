export function BlockedTimeCell() {
  return (
    <div
      className="group absolute inset-0 flex h-full flex-col hover:cursor-not-allowed"
      style={{
        backgroundColor: "var(--cal-bg-subtle)",
        background:
          "repeating-linear-gradient(-45deg, var(--cal-bg-subtle), var(--cal-bg-subtle) 2.5px, var(--cal-bg-muted) 2.5px, var(--cal-bg-muted) 6.5px)",
      }}
    />
  );
}
