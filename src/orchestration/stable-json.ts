const sortObjectKeys = (_key: string, value: unknown): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
};

/** Deterministic JSON for reference identities, hashes, and reducer equality checks. */
export const stableJson = (value: unknown): string => {
  const serialized = JSON.stringify(value, sortObjectKeys);
  if (serialized === undefined) {
    throw new TypeError("stableJson requires a JSON-serializable root value");
  }
  return serialized;
};

export const stableJsonEqual = (left: unknown, right: unknown): boolean =>
  stableJson(left) === stableJson(right);
