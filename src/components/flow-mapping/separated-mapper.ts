import { Position, MarkerType } from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import type { Item, Facility, ItemId } from "@/types";
import type { ProductionNode } from "@/lib/calculator";
import type {
  FlowProductionNode,
  FlowNodeDataSeparated,
  FlowNodeDataSeparatedWithTarget,
  FlowTargetNode,
} from "./types";
import { CapacityPoolManager } from "./capacity-pool";
import { applyEdgeStyling } from "./edge-styling";

/**
 * Creates a stable key for a ProductionNode.
 *
 * This key identifies unique production steps across the dependency tree,
 * allowing proper merging of duplicate nodes before splitting into facilities.
 *
 * @param node The ProductionNode to create a key for
 * @returns A unique string key for the node
 */
const createFlowNodeKey = (node: ProductionNode): string => {
  const itemId = node.item.id;
  const recipeId = node.recipe?.id ?? "raw";
  const rawFlag = node.isRawMaterial ? "raw" : "prod";
  return `${itemId}__${recipeId}__${rawFlag}`;
};

/**
 * Aggregated production node data for separated mode.
 * Combines multiple occurrences of the same production step.
 */
type AggregatedProductionData = {
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
 * while summing up rates for nodes that appear in multiple branches.
 *
 * @param rootNodes Root nodes of the dependency tree
 * @returns Map of node keys to their aggregated production data
 */
function collectUniqueNodes(
  rootNodes: ProductionNode[],
): Map<string, AggregatedProductionData> {
  const nodeMap = new Map<string, AggregatedProductionData>();

  const collect = (node: ProductionNode) => {
    const key = createFlowNodeKey(node);
    const existing = nodeMap.get(key);

    if (existing) {
      // Aggregate rates from multiple occurrences
      existing.totalRate += node.targetRate;
      existing.totalFacilityCount += node.facilityCount;
    } else {
      // First encounter: create new entry
      nodeMap.set(key, {
        node,
        totalRate: node.targetRate,
        totalFacilityCount: node.facilityCount,
      });
    }

    node.dependencies.forEach(collect);
  };

  rootNodes.forEach(collect);
  return nodeMap;
}

/**
 * Performs topological sort on production nodes to determine processing order.
 *
 * Returns nodes in dependency order (producers before consumers), ensuring that
 * when we allocate capacity, all upstream producers are already initialized.
 *
 * @param nodeMap Map of aggregated production data
 * @returns Array of node keys in topological order (leaves to roots)
 */
function topologicalSort(
  nodeMap: Map<string, AggregatedProductionData>,
): string[] {
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, Set<string>>();

  // Initialize structures
  nodeMap.forEach((_, key) => {
    inDegree.set(key, 0);
    adjList.set(key, new Set());
  });

  // Build adjacency list and calculate in-degrees
  nodeMap.forEach((data, key) => {
    data.node.dependencies.forEach((dep) => {
      const depKey = createFlowNodeKey(dep);
      if (nodeMap.has(depKey)) {
        adjList.get(depKey)!.add(key);
        inDegree.set(key, (inDegree.get(key) || 0) + 1);
      }
    });
  });

  // Start with nodes that have no dependencies (in-degree 0)
  const queue: string[] = [];
  inDegree.forEach((degree, key) => {
    if (degree === 0) {
      queue.push(key);
    }
  });

  // Process queue to build topological order
  const sorted: string[] = [];
  while (queue.length > 0) {
    const key = queue.shift()!;
    sorted.push(key);

    // Reduce in-degree for dependent nodes
    adjList.get(key)!.forEach((dependentKey) => {
      const newDegree = inDegree.get(dependentKey)! - 1;
      inDegree.set(dependentKey, newDegree);
      if (newDegree === 0) {
        queue.push(dependentKey);
      }
    });
  }

  return sorted;
}

/**
 * Maps a UnifiedProductionPlan to React Flow nodes and edges in separated mode.
 *
 * In separated mode, each physical facility is represented as an individual node.
 * This provides a detailed view suitable for planning physical layouts and
 * understanding resource distribution.
 *
 * The algorithm:
 * 1. Collects and deduplicates production nodes
 * 2. Creates capacity pools for each unique production step
 * 3. Generates individual facility nodes
 * 4. Allocates capacity and creates edges using demand-driven allocation
 * 5. Creates target sink nodes for user-defined goals
 *
 * @param rootNodes The root ProductionNodes of the dependency tree
 * @param items All available items in the game
 * @param facilities All available facilities in the game
 * @param originalTargets Original user-defined production targets (optional)
 * @returns An object containing the generated React Flow nodes and edges
 */
export function mapPlanToFlowSeparated(
  rootNodes: ProductionNode[],
  items: Item[],
  facilities: Facility[],
  originalTargets?: Array<{ itemId: ItemId; rate: number }>,
): { nodes: (FlowProductionNode | FlowTargetNode)[]; edges: Edge[] } {
  // Step 1: Collect unique nodes with aggregated rates and determine processing order
  const nodeMap = collectUniqueNodes(rootNodes);
  const sortedKeys = topologicalSort(nodeMap);

  // Create a map of target items for quick lookup
  const targetMap = new Map<ItemId, number>();
  if (originalTargets) {
    originalTargets.forEach((target) => {
      targetMap.set(target.itemId, target.rate);
    });
  }

  // Step 2: Initialize capacity pool manager with aggregated production rates
  const poolManager = new CapacityPoolManager();

  sortedKeys.forEach((key) => {
    const aggregatedData = nodeMap.get(key)!;

    // Create a ProductionNode with aggregated totals for capacity calculation
    const aggregatedNode: ProductionNode = {
      ...aggregatedData.node,
      targetRate: aggregatedData.totalRate,
      facilityCount: aggregatedData.totalFacilityCount,
    };

    poolManager.createPool(aggregatedNode, key);
  });

  // Step 3: Generate Flow nodes from facility instances
  const flowNodes: Node<
    FlowNodeDataSeparated | FlowNodeDataSeparatedWithTarget
  >[] = [];
  const targetSinkNodes: FlowTargetNode[] = [];

  nodeMap.forEach((aggregatedData, key) => {
    const node = aggregatedData.node;

    // Check if this node is also a direct target
    const isDirectTarget = targetMap.has(node.item.id);
    const directTargetRate = isDirectTarget
      ? targetMap.get(node.item.id)
      : undefined;

    if (node.isRawMaterial) {
      // Raw materials are shown as single nodes (no facility splitting)
      // Use aggregated rate for display
      const isCircular = node.recipe !== null;
      const aggregatedNode: ProductionNode = {
        ...node,
        targetRate: aggregatedData.totalRate,
        facilityCount: aggregatedData.totalFacilityCount,
      };

      flowNodes.push({
        id: `node-${key}`,
        type: "productionNode",
        data: {
          productionNode: aggregatedNode,
          isCircular,
          items,
          facilities,
          isDirectTarget,
          directTargetRate,
        },
        position: { x: 0, y: 0 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
    } else {
      // Production nodes are split into individual facilities
      const facilityInstances = poolManager.getFacilityInstances(key);
      const totalFacilities = facilityInstances.length;

      facilityInstances.forEach((facility) => {
        const isPartialLoad =
          facility.actualOutputRate < facility.maxOutputRate * 0.999; // Small epsilon for floating point comparison

        // Create a modified ProductionNode for this specific facility instance
        // with targetRate set to this facility's actual output rate
        const facilitySpecificNode: ProductionNode = {
          ...node,
          targetRate: facility.actualOutputRate,
          facilityCount: 1, // Each node represents exactly 1 facility
        };

        flowNodes.push({
          id: facility.facilityId,
          type: "productionNode",
          data: {
            productionNode: facilitySpecificNode,
            isCircular: false,
            items,
            facilities,
            // Separated mode specific fields
            facilityIndex: facility.facilityIndex,
            totalFacilities,
            isPartialLoad,
            isDirectTarget,
            directTargetRate,
          },
          position: { x: 0, y: 0 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        });
      });
    }
  });

  // Step 4: Generate edges by allocating capacity
  const edges: Edge[] = [];
  let edgeIdCounter = 0;

  // Process nodes in reverse topological order (consumers before producers)
  // This ensures we connect from producers to consumers
  const reverseOrder = [...sortedKeys].reverse();

  reverseOrder.forEach((consumerKey) => {
    const consumerData = nodeMap.get(consumerKey)!;
    const consumerNode = consumerData.node;

    // Skip raw materials (they don't consume anything)
    if (consumerNode.isRawMaterial) {
      return;
    }

    const consumerFacilities = poolManager.getFacilityInstances(consumerKey);

    // For each consumer facility, allocate inputs from producer facilities
    consumerFacilities.forEach((consumerFacility) => {
      const consumerId = consumerFacility.facilityId;
      const consumerOutputRate = consumerFacility.actualOutputRate;

      // Process each dependency (input material)
      consumerNode.dependencies.forEach((dependency) => {
        const depKey = createFlowNodeKey(dependency);

        // Calculate demand rate for this specific consumer facility
        const recipe = consumerNode.recipe!;
        const inputItem = recipe.inputs.find(
          (inp) => inp.itemId === dependency.item.id,
        );
        const outputItem = recipe.outputs.find(
          (out) => out.itemId === consumerNode.item.id,
        );

        if (!inputItem || !outputItem) {
          console.warn(
            `Recipe mismatch for ${consumerNode.item.id}: missing input or output`,
          );
          return;
        }

        // Calculate the input rate needed for this consumer's output rate
        const inputOutputRatio = inputItem.amount / outputItem.amount;
        const demandRate = inputOutputRatio * consumerOutputRate;

        // Allocate capacity from producer pool
        if (dependency.isRawMaterial) {
          // Connect directly to the raw material node
          const rawMaterialNodeId = `node-${depKey}`;
          edges.push({
            id: `e${edgeIdCounter++}`,
            source: rawMaterialNodeId,
            target: consumerId,
            type: "default",
            label: `${demandRate.toFixed(2)} /min`,
            data: { flowRate: demandRate },
            markerEnd: {
              type: MarkerType.ArrowClosed,
            },
          });
        } else {
          // Allocate from capacity pool
          const allocations = poolManager.allocate(depKey, demandRate);

          allocations.forEach((allocation) => {
            edges.push({
              id: `e${edgeIdCounter++}`,
              source: allocation.sourceNodeId,
              target: consumerId,
              type: "default",
              label: `${allocation.allocatedAmount.toFixed(2)} /min`,
              data: { flowRate: allocation.allocatedAmount },
              markerEnd: {
                type: MarkerType.ArrowClosed,
              },
            });
          });
        }
      });
    });
  });

  // Step 5: Create target sink nodes for each original target
  if (originalTargets) {
    originalTargets.forEach((target) => {
      const item = items.find((i) => i.id === target.itemId);
      if (!item) return;

      const targetNodeId = `target-sink-${target.itemId}`;

      // Find the production key for this item
      const productionKey = Array.from(nodeMap.keys()).find((key) => {
        const nodeData = nodeMap.get(key)!;
        return (
          nodeData.node.item.id === target.itemId &&
          !nodeData.node.isRawMaterial
        );
      });

      if (productionKey) {
        // In separated mode, we need to allocate from the capacity pool
        const allocations = poolManager.allocate(productionKey, target.rate);

        // Create target sink node
        targetSinkNodes.push({
          id: targetNodeId,
          type: "targetSink",
          data: {
            item,
            targetRate: target.rate,
            items,
          },
          position: { x: 0, y: 0 },
          targetPosition: Position.Left,
        });

        // Create edges from allocated facilities to target sink
        allocations.forEach((allocation) => {
          edges.push({
            id: `e${edgeIdCounter++}`,
            source: allocation.sourceNodeId,
            target: targetNodeId,
            type: "default",
            label: `${allocation.allocatedAmount.toFixed(2)} /min`,
            data: { flowRate: allocation.allocatedAmount },
            animated: true, // Animate target edges for emphasis
            style: { stroke: "#10b981", strokeWidth: 2 }, // Green, thicker
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#10b981",
            },
          });
        });
      }
    });
  }

  // Apply dynamic styling to edges
  const styledEdges = applyEdgeStyling(edges);

  return {
    nodes: [...flowNodes, ...targetSinkNodes] as (
      | FlowProductionNode
      | FlowTargetNode
    )[],
    edges: styledEdges,
  };
}
