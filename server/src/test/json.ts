// Parsed JSON in tests is untyped on purpose: assertions read nested fields of whatever the route returned.
// One documented alias instead of `any` (or a suppression) at every use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any
