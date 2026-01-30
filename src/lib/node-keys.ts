/**
 * Create a target sink node ID.
 *
 * @example
 * createTargetSinkId("item_iron_powder") // "target-sink-item_iron_powder"
 */
export function createTargetSinkId(itemId: string): string {
  return `target-sink-${itemId}`;
}

/**
 * Create a raw material node ID.
 *
 * @example
 * createRawMaterialId("iron_ore") // "raw_iron_ore"
 */
export function createRawMaterialId(itemId: string): string {
  return `raw_${itemId}`;
}

/**
 * Create a pickup point node ID for separated mode.
 *
 * @example
 * createPickupPointId("iron_ore", 0) // "raw_iron_ore-p0"
 */
export function createPickupPointId(itemId: string, index: number): string {
  return `${createRawMaterialId(itemId)}-p${index}`;
}
