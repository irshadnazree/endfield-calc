import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Recipe, ItemId } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Calculates demand rate for an input based on recipe ratios
 */
export function calculateDemandRate(
  recipe: Recipe,
  inputItemId: ItemId,
  outputItemId: ItemId,
  outputRate: number,
): number | null {
  const input = recipe.inputs.find((i) => i.itemId === inputItemId);
  const output = recipe.outputs.find((o) => o.itemId === outputItemId);

  if (!input || !output) return null;

  return (input.amount / output.amount) * outputRate;
}

/**
 * Performs topological sort on a dependency graph
 * Returns nodes in dependency order (producers before consumers)
 */
export function topologicalSort<T>(
  nodes: Map<string, T>,
  getDependencies: (node: T) => Set<string>,
): string[] {
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, Set<string>>();

  // Initialize structures
  nodes.forEach((_, key) => {
    inDegree.set(key, 0);
    adjList.set(key, new Set());
  });

  // Build adjacency list and calculate in-degrees
  nodes.forEach((node, key) => {
    getDependencies(node).forEach((depKey) => {
      if (nodes.has(depKey)) {
        adjList.get(depKey)!.add(key);
        inDegree.set(key, (inDegree.get(key) || 0) + 1);
      }
    });
  });

  // Start with nodes that have no dependencies
  const queue: string[] = [];
  inDegree.forEach((degree, key) => {
    if (degree === 0) queue.push(key);
  });

  // Process queue
  const sorted: string[] = [];
  while (queue.length > 0) {
    const key = queue.shift()!;
    sorted.push(key);

    adjList.get(key)!.forEach((dependentKey) => {
      const newDegree = inDegree.get(dependentKey)! - 1;
      inDegree.set(dependentKey, newDegree);
      if (newDegree === 0) queue.push(dependentKey);
    });
  }

  return sorted;
}
