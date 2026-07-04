export type RecentEntry = { id: string; name: string; number: string; date: number; types: number[]; count: number };

// 1=incoming 2=outgoing 3=missed 5=rejected
function dayLabel(ts: number): string {
  if (!ts) return 'Unknown';
  const now = new Date();
  const d = new Date(ts);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = todayStart - dayStart;
  if (diff <= 0) return 'Today';
  if (diff <= 86_400_000) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

type SeparatorItem = { _sep: true; id: string; label: string };
export type CommunicationListItem = RecentEntry | SeparatorItem;

export function withDateSeparators(entries: RecentEntry[]): CommunicationListItem[] {
  const result: CommunicationListItem[] = [];
  let lastLabel = '';
  for (const entry of entries) {
    const label = dayLabel(entry.date);
    if (label !== lastLabel) {
      result.push({ _sep: true, id: `sep-${label}`, label });
      lastLabel = label;
    }
    result.push(entry);
  }
  return result;
}
