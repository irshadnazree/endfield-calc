import type { ItemId } from "@/types";
import type { ProductionNode } from "@/lib/calculator";

/**
 * Creates a stable key for a ProductionNode.
 *
 * This key is used to identify unique production steps across the dependency tree,
 * allowing proper merging or aggregation of identical nodes.
 *
 * @param node The ProductionNode to create a key for
 * @returns A unique string key for the node
 */
export const createFlowNodeKey = (node: ProductionNode): string => {
  const itemId = node.item.id;
  const recipeId = node.recipe?.id ?? "raw";
  const rawFlag = node.isRawMaterial ? "raw" : "prod";
  return `${itemId}__${recipeId}__${rawFlag}`;
};

/**
 * Aggregated production node data.
 * Combines multiple occurrences of the same production step.
 */
export type AggregatedProductionNodeData = {
  /** Representative ProductionNode (from first encounter) */
  node: ProductionNode;
  /** Total production rate across all branches */
  totalRate: number;
  /** Total facility count across all branches */
  totalFacilityCount: number;
};

/**
 * Collects all unique production nodes from the dependency tree and aggregates their requirements.
 *
 * Traverses the tree and deduplicates nodes based on their key,
 * while summing up rates and facility counts for nodes that appear in multiple branches.
 *
 * @param rootNodes Root nodes of the dependency tree
 * @returns Map of node keys to their aggregated production data
 */
export function aggregateProductionNodes(
  rootNodes: ProductionNode[],
): Map<string, AggregatedProductionNodeData> {
  const nodeMap = new Map<string, AggregatedProductionNodeData>();

  const collect = (node: ProductionNode) => {
    const key = createFlowNodeKey(node);
    const existing = nodeMap.get(key);

    if (existing) {
      // Aggregate rates and facility counts from multiple occurrences
      existing.totalRate += node.targetRate;
      existing.totalFacilityCount += node.facilityCount;

      // Preserve isTarget flag: if ANY occurrence is a target, mark it as target
      if (node.isTarget && !existing.node.isTarget) {
        existing.node = {
          ...existing.node,
          isTarget: true,
        };
      }
    } else {
      // First encounter: create new entry
      nodeMap.set(key, {
        node,
        totalRate: node.targetRate,
        totalFacilityCount: node.facilityCount,
      });
    }

    // Recursively process dependencies
    node.dependencies.forEach(collect);
  };

  rootNodes.forEach(collect);
  return nodeMap;
}

/**
 * Creates a map from ItemId to its target rate for quick lookup.
 * @param originalTargets Array of user-defined targets
 * @returns A Map where key is ItemId and value is target rate
 */
export function createTargetMap(
  originalTargets?: Array<{ itemId: ItemId; rate: number }>,
): Map<ItemId, number> {
  const targetMap = new Map<ItemId, number>();
  if (originalTargets) {
    originalTargets.forEach((target) => {
      targetMap.set(target.itemId, target.rate);
    });
  }
  return targetMap;
}

/**
 * Generates a stable and readable node ID from a given key.
 * A prefix is added to avoid collisions with other ID formats.
 *
 * @param key The unique key generated for a ProductionNode
 * @returns A formatted node ID
 */
export const makeNodeIdFromKey = (key: string) => `node-${key}`;

/**
 * Identifies target nodes that serve as upstream dependencies for other targets.
 * These targets need both a production node (marked as target) and a separate target sink.
 *
 * @param rootNodes Root nodes of the dependency tree
 * @returns Set of node keys for targets that are upstream of other targets
 */
export function findTargetsWithDownstream(
  rootNodes: ProductionNode[],
): Set<string> {
  const targetsWithDownstream = new Set<string>();

  // Collect all target nodes with cycle protection
  const allTargetNodes: ProductionNode[] = [];
  const collectTargets = (node: ProductionNode, visited: Set<string>) => {
    const key = createFlowNodeKey(node);

    // Prevent infinite loops in circular dependencies
    if (visited.has(key)) {
      return;
    }
    visited.add(key);

    if (node.isTarget) {
      allTargetNodes.push(node);
    }

    node.dependencies.forEach((dep) => collectTargets(dep, visited));
  };

  rootNodes.forEach((root) => collectTargets(root, new Set()));

  // For each target, check if any other target depends on it
  allTargetNodes.forEach((targetNode) => {
    const targetKey = createFlowNodeKey(targetNode);

    // Check all other targets' dependency trees
    allTargetNodes.forEach((otherTarget) => {
      if (otherTarget === targetNode) return;

      // Traverse this target's dependencies to see if it includes targetNode
      // Use visited set to prevent infinite loops
      const hasDependency = (
        node: ProductionNode,
        visited: Set<string>,
      ): boolean => {
        const nodeKey = createFlowNodeKey(node);

        // Prevent infinite loops
        if (visited.has(nodeKey)) {
          return false;
        }
        visited.add(nodeKey);

        if (nodeKey === targetKey) return true;
        return node.dependencies.some((dep) => hasDependency(dep, visited));
      };

      if (
        otherTarget.dependencies.some((dep) => hasDependency(dep, new Set()))
      ) {
        targetsWithDownstream.add(targetKey);
      }
    });
  });

  return targetsWithDownstream;
}

export function shouldSkipNode(
  node: ProductionNode,
  nodeKey: string,
  targetsWithDownstream: Set<string>,
): boolean {
  return node.isTarget && !targetsWithDownstream.has(nodeKey);
}
