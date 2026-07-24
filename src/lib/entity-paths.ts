/**
 * URL helpers for entity detail routes.
 *
 * Convention: detail URLs use `{slug}-{uuid}` so they are both human-readable
 * and permanently stable (slug can change, uuid never does).
 *
 * Example: /app/products/sprite-a1b2c3d4-e5f6-7890-abcd-ef1234567890
 */

/** Build the route param for a product (or any entity) detail page. */
export function productParam(entity: { slug: string; uuid: string }): string {
  return `${entity.slug}-${entity.uuid}`;
}

/**
 * Extract the UUID from a `slug-uuid` route param.
 * UUID v4 is always exactly 36 characters: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
export function parseProductParam(param: string): string {
  return param.slice(-36);
}
