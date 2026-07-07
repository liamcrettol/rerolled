import BadgeChip from "@/components/badges/BadgeChip";
import { MODE_LABEL, MODE_ORDER } from "@/lib/badges/style";
import type { CatalogBadge } from "@/lib/badges/data";

// Full Badge Case (#297) — every badge the player can see (earned, plus
// unearned-but-not-hidden), grouped into a section per mode in a fixed
// display order. Locked tiles render dimmed via BadgeChip's `locked` prop;
// hidden badges the player hasn't earned were already filtered out upstream
// by getBadgeCatalog, so nothing here can leak a secret badge's existence.

export default function BadgeCase({ badges }: { badges: CatalogBadge[] }) {
  const byMode = new Map<string, CatalogBadge[]>();
  for (const b of badges) {
    const key = b.mode ?? "core";
    if (!byMode.has(key)) byMode.set(key, []);
    byMode.get(key)!.push(b);
  }

  const groups = MODE_ORDER.map((mode) => ({
    mode,
    entries: (byMode.get(mode) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
  })).filter((g) => g.entries.length > 0);

  if (groups.length === 0) {
    return (
      <div className="panel p-6 text-center text-sm text-gray-500">
        No badges available yet.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {groups.map(({ mode, entries }) => (
        <section key={mode}>
          <div className="flex items-center justify-between mb-3">
            <p className="section-label">{MODE_LABEL[mode]}</p>
            <p className="text-[11px] text-gray-500">
              {entries.filter((e) => e.earned).length} / {entries.length} earned
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {entries.map((b) => (
              <BadgeChip
                key={b.slug}
                name={b.name}
                description={b.description}
                tier={b.tier}
                mode={b.mode}
                iconKey={b.iconKey}
                size="full"
                locked={!b.earned}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
