import type { LocalizationView } from "../../core/api";

export function documentPayload(
  draft: LocalizationView,
  original: LocalizationView | null,
) {
  const originalItems = new Map(
    original?.documents.items.map((item) => [item.key, item]) ?? [],
  );
  return draft.documents.items
    .map((item) => {
      const before = originalItems.get(item.key);
      return {
        key: item.key,
        meta: item.meta,
        values: Object.fromEntries(
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
        ),
      };
    })
    .filter((item) => Object.keys(item.values).length > 0);
}
