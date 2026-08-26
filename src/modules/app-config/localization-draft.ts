import type { LocalizationView } from "../../core/api";

export function documentPayload(
  draft: LocalizationView,
  original: LocalizationView | null,
) {
  const originalItems = new Map(
    original?.documents.items.map((item) => [item.key.toLowerCase(), item]) ??
      [],
  );
  return draft.documents.items
    .map((item) => {
      const key = item.key.trim().toLowerCase();
      const before = originalItems.get(key);
      const values = Object.fromEntries(
        Object.entries(item.values)
          .filter(([code, value]) => {
            const previous = before?.values[code];
            if (!previous) return value.content.trim() !== "";
            if (previous.content === value.content) return false;
            if (value.content.trim() === "" && previous.source !== "tenant")
              return false;
            return true;
          })
          .map(([code, value]) => [
            code,
            value.content.trim() === "" ? null : value.content,
          ]),
      );
      const enabledChanged = Boolean(before && item.enabled !== before.enabled);
      if (before && !enabledChanged && Object.keys(values).length === 0)
        return null;
      return {
        key,
        meta: item.meta,
        ...(before ? {} : { create: true }),
        ...(enabledChanged ? { enabled: item.enabled } : {}),
        values,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}
