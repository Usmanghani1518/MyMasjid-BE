



export const parseDurationToMs = (value: string): number => {
  const match = value.trim().toLowerCase().match(/^(\d+)\s*(ms|s|m|h|d|w)?$/);
  if (!match) throw new Error(`Invalid duration: ${value}`);
  const amount = parseInt(match[1] ?? '0', 10);
  const unit = match[2] ?? 'ms';
  const multiplier: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  return amount * multiplier[unit];
};
