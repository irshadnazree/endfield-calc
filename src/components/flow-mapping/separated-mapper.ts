import { Position } from "@xyflow/react";
import type { Edge } from "@xyflow/react";
import type { Item, Facility, ItemId } from "@/types";
import type { DetectedCycle, ProductionNode } from "@/lib/calculator";
import type { FlowProductionNode, FlowTargetNode } from "./types";
import { CapacityPoolManager } from "./capacity-pool";
import { applyEdgeStyling } from "./edge-styling";
import {
  createFlowNodeKey,
  aggregateProductionNodes,
  makeNodeIdFromKey,
  type AggregatedProductionNodeData,
  findTargetsWithDownstream,
  shouldSkipNode,
  createCycleInfo,
  isCircularBreakpoint,
  createEdge,
} from "./flow-utils";
import { calculateDemandRate, topologicalSort } from "@/lib/utils";

/**
 * Performs topological sort on production nodes to determine processing order.
 *
 * Returns nodes in dependency order (producers before consumers), ensuring that
 * when we allocate capacity, all upstream producers are already initialized.
 *
 * @param nodeMap Map of aggregated production data
 * @returns Array of node keys in topological order (leaves to roots)
 */
function topologicalSortNodes(
  nodeMap: Map<string, AggregatedProductionNodeData>,
): string[] {
  return topologicalSort(nodeMap, (data) => {
    const deps = new Set<string>();
    data.node.dependencies.forEach((dep) => {
      const depKey = createFlowNodeKey(dep);
      if (nodeMap.has(depKey)) {
        deps.add(depKey);
      }
    });
    return deps;
  });
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
  detectedCycles: DetectedCycle[] = [],
): { nodes: (FlowProductionNode | FlowTargetNode)[]; edges: Edge[] } {
  const nodeMap = aggregateProductionNodes(rootNodes);
  const sortedKeys = topologicalSortNodes(nodeMap);
  const targetsWithDownstream = findTargetsWithDownstream(rootNodes);
  const itemMap = new Map(items.map((item) => [item.id, item]));

  // Initialize capacity pools
  const poolManager = new CapacityPoolManager();
  sortedKeys.forEach((key) => {
    const aggregatedData = nodeMap.get(key)!;
    const node = aggregatedData.node;

    if (shouldSkipNode(node, key, targetsWithDownstream)) return;
    if (isCircularBreakpoint(node, detectedCycles)) return;

    poolManager.createPool(
      {
        ...node,
        targetRate: aggregatedData.totalRate,
        facilityCount: aggregatedData.totalFacilityCount,
      },
      key,
    );
  });

  // Generate production nodes
  const flowNodes: FlowProductionNode[] = [];
  nodeMap.forEach((aggregatedData, key) => {
    const node = aggregatedData.node;

    if (shouldSkipNode(node, key, targetsWithDownstream)) return;
    if (isCircularBreakpoint(node, detectedCycles)) return;

    const isDirectTarget = node.isTarget && targetsWithDownstream.has(key);
    const directTargetRate = isDirectTarget
      ? aggregatedData.totalRate
      : undefined;

    if (node.isRawMaterial) {
      flowNodes.push(
        createProductionFlowNode(
          makeNodeIdFromKey(key),
          {
            ...node,
            targetRate: aggregatedData.totalRate,
            facilityCount: aggregatedData.totalFacilityCount,
          },
          items,
          facilities,
          detectedCycles,
          itemMap,
          undefined,
          undefined,
          undefined,
          isDirectTarget,
          directTargetRate,
        ),
      );
    } else {
      poolManager.getFacilityInstances(key).forEach((facility) => {
        flowNodes.push(
          createProductionFlowNode(
            facility.facilityId,
            {
              ...node,
              targetRate: facility.actualOutputRate,
              facilityCount: 1,
            },
            items,
            facilities,
            detectedCycles,
            itemMap,
            facility.facilityIndex,
            poolManager.getFacilityInstances(key).length,
            facility.actualOutputRate < facility.maxOutputRate * 0.999,
            isDirectTarget,
            directTargetRate,
          ),
        );
      });
    }
  });

  // Generate edges
  const edges: Edge[] = [];
  let edgeIdCounter = 0;

  [...sortedKeys].reverse().forEach((consumerKey) => {
    const consumerData = nodeMap.get(consumerKey)!;
    const consumerNode = consumerData.node;

    if (shouldSkipNode(consumerNode, consumerKey, targetsWithDownstream))
      return;
    if (isCircularBreakpoint(consumerNode, detectedCycles)) return;

    poolManager
      .getFacilityInstances(consumerKey)
      .forEach((consumerFacility) => {
        consumerNode.dependencies.forEach((dependency) => {
          const depKey = createFlowNodeKey(dependency);
          const recipe = consumerNode.recipe!;
          const demandRate = calculateDemandRate(
            recipe,
            dependency.item.id,
            consumerNode.item.id,
            consumerFacility.actualOutputRate,
          );

          if (demandRate === null) return;

          const isBreakpoint = isCircularBreakpoint(dependency, detectedCycles);

          if (isBreakpoint) {
            const productionKey = findProductionKeyForItem(
              dependency.item.id,
              nodeMap,
            );
            if (productionKey) {
              poolManager
                .allocate(productionKey, demandRate)
                .forEach((allocation) => {
                  edges.push(
                    createEdge(
                      `e${edgeIdCounter++}`,
                      allocation.sourceNodeId,
                      consumerFacility.facilityId,
                      allocation.allocatedAmount,
                      {
                        isPartOfCycle: true,
                      },
                    ),
                  );
                });
            }
          } else if (dependency.isRawMaterial) {
            edges.push(
              createEdge(
                `e${edgeIdCounter++}`,
                `node-${depKey}`,
                consumerFacility.facilityId,
                demandRate,
              ),
            );
          } else {
            poolManager.allocate(depKey, demandRate).forEach((allocation) => {
              edges.push(
                createEdge(
                  `e${edgeIdCounter++}`,
                  allocation.sourceNodeId,
                  consumerFacility.facilityId,
                  allocation.allocatedAmount,
                ),
              );
            });
          }
        });
      });
  });

  // Create target sink nodes
  const targetSinkNodes: FlowTargetNode[] = [];
  const targetNodes = Array.from(nodeMap.entries()).filter(
    ([, data]) => data.node.isTarget && !data.node.isRawMaterial,
  );

  targetNodes.forEach(([productionKey, data]) => {
    const targetNodeId = `target-sink-${data.node.item.id}`;
    const hasDownstream = targetsWithDownstream.has(productionKey);

    targetSinkNodes.push({
      id: targetNodeId,
      type: "targetSink",
      data: {
        item: data.node.item,
        targetRate: data.totalRate,
        items,
        facilities,
        productionInfo: !hasDownstream
          ? {
              facility: data.node.facility,
              facilityCount: data.totalFacilityCount,
              recipe: data.node.recipe,
            }
          : undefined,
      },
      position: { x: 0, y: 0 },
      targetPosition: Position.Left,
    });

    if (hasDownstream) {
      poolManager
        .allocate(productionKey, data.totalRate)
        .forEach((allocation) => {
          edges.push(
            createEdge(
              `e${edgeIdCounter++}`,
              allocation.sourceNodeId,
              targetNodeId,
              allocation.allocatedAmount,
              {
                animated: true,
                style: { stroke: "#10b981", strokeWidth: 2 },
              },
            ),
          );
        });
    } else {
      edges.push(
        ...createTargetDependencyEdgesWithCycles(
          data.node,
          targetNodeId,
          data.totalRate,
          poolManager,
          nodeMap,
          detectedCycles,
          { count: edgeIdCounter },
        ),
      );
      edgeIdCounter = edges.length;
    }
  });

  // Add cycle closure edges
  detectedCycles.forEach((cycle) => {
    const breakPointItemId = cycle.breakPointItemId;
    if (cycle.involvedItemIds.length < 2) return;

    const breakPointIndex = cycle.involvedItemIds.indexOf(breakPointItemId);
    const consumerIndex = (breakPointIndex + 1) % cycle.involvedItemIds.length;
    const consumerItemId = cycle.involvedItemIds[consumerIndex];

    const breakPointProductionKey = findProductionKeyForItem(
      breakPointItemId,
      nodeMap,
    );
    const consumerProductionKey = findProductionKeyForItem(
      consumerItemId,
      nodeMap,
    );

    if (!breakPointProductionKey || !consumerProductionKey) return;

    const breakPointFacilities = poolManager.getFacilityInstances(
      breakPointProductionKey,
    );
    const consumerFacilities = poolManager.getFacilityInstances(
      consumerProductionKey,
    );

    if (breakPointFacilities.length === 0 || consumerFacilities.length === 0)
      return;

    const consumerNode = nodeMap.get(consumerProductionKey)?.node;
    if (!consumerNode?.recipe) return;

    const breakPointInput = consumerNode.recipe.inputs.find(
      (i) => i.itemId === breakPointItemId,
    );
    const consumerOutput = consumerNode.recipe.outputs.find(
      (o) => o.itemId === consumerItemId,
    );
    if (!breakPointInput || !consumerOutput) return;

    const totalConsumerRate = consumerFacilities.reduce(
      (sum, f) => sum + f.actualOutputRate,
      0,
    );
    const totalFlowRate =
      (breakPointInput.amount / consumerOutput.amount) * totalConsumerRate;

    let remainingFlow = totalFlowRate;
    let consumerIdx = 0;

    breakPointFacilities.forEach((breakPointFacility, idx) => {
      if (remainingFlow <= 0.001) return;

      const flowFromThisFacility = Math.min(
        breakPointFacility.actualOutputRate,
        remainingFlow,
      );
      const targetConsumer =
        consumerFacilities[consumerIdx % consumerFacilities.length];

      edges.push(
        createEdge(
          `cycle-closure-${cycle.cycleId}-${idx}`,
          breakPointFacility.facilityId,
          targetConsumer.facilityId,
          flowFromThisFacility,
          {
            isCycleClosure: true,
            animated: true,
            style: {
              stroke: "#a855f7",
              strokeWidth: 2.5,
              strokeDasharray: "5,5",
            },
            labelStyle: { fill: "#a855f7", fontWeight: 600 },
            labelBgStyle: { fill: "#faf5ff" },
          },
        ),
      );

      remainingFlow -= flowFromThisFacility;
      consumerIdx++;
    });
  });

  return {
    nodes: [...flowNodes, ...targetSinkNodes],
    edges: applyEdgeStyling(edges),
  };
}

/**
 * Helper: Creates target dependency edges with cycle awareness
 */
function createTargetDependencyEdgesWithCycles(
  targetNode: ProductionNode,
  targetNodeId: string,
  totalRate: number,
  poolManager: CapacityPoolManager,
  nodeMap: Map<string, AggregatedProductionNodeData>,
  detectedCycles: DetectedCycle[],
  edgeIdCounter: { count: number },
): Edge[] {
  const edges: Edge[] = [];
  const recipe = targetNode.recipe;
  if (!recipe) return edges;

  targetNode.dependencies.forEach((dep) => {
    const depKey = createFlowNodeKey(dep);
    const demandRate = calculateDemandRate(
      recipe,
      dep.item.id,
      targetNode.item.id,
      totalRate,
    );
    if (demandRate === null) return;

    const isBreakpoint = isCircularBreakpoint(dep, detectedCycles);

    if (isBreakpoint) {
      const productionKey = findProductionKeyForItem(dep.item.id, nodeMap);
      if (productionKey) {
        poolManager
          .allocate(productionKey, demandRate)
          .forEach((allocation) => {
            edges.push(
              createEdge(
                `e${edgeIdCounter.count++}`,
                allocation.sourceNodeId,
                targetNodeId,
                allocation.allocatedAmount,
                {
                  isPartOfCycle: true,
                  animated: true,
                  style: { stroke: "#10b981", strokeWidth: 2 },
                },
              ),
            );
          });
      }
    } else if (dep.isRawMaterial) {
      edges.push(
        createEdge(
          `e${edgeIdCounter.count++}`,
          `node-${depKey}`,
          targetNodeId,
          demandRate,
          {
            animated: true,
            style: { stroke: "#10b981", strokeWidth: 2 },
          },
        ),
      );
    } else {
      poolManager.allocate(depKey, demandRate).forEach((allocation) => {
        edges.push(
          createEdge(
            `e${edgeIdCounter.count++}`,
            allocation.sourceNodeId,
            targetNodeId,
            allocation.allocatedAmount,
            {
              animated: true,
              style: { stroke: "#10b981", strokeWidth: 2 },
            },
          ),
        );
      });
    }
  });

  return edges;
}

/**
 * Helper: Finds production key for a given item ID
 */
function findProductionKeyForItem(
  itemId: ItemId,
  nodeMap: Map<string, AggregatedProductionNodeData>,
): string | null {
  for (const [key, data] of nodeMap.entries()) {
    if (
      !data.node.isRawMaterial &&
      data.node.item.id === itemId &&
      data.node.recipe
    ) {
      return key;
    }
  }
  return null;
}

/**
 * Helper: Creates production flow node
 */
function createProductionFlowNode(
  nodeId: string,
  node: ProductionNode,
  items: Item[],
  facilities: Facility[],
  detectedCycles: DetectedCycle[],
  itemMap: Map<ItemId, Item>,
  facilityIndex?: number,
  totalFacilities?: number,
  isPartialLoad?: boolean,
  isDirectTarget?: boolean,
  directTargetRate?: number,
): FlowProductionNode {
  return {
    id: nodeId,
    type: "productionNode",
    data: {
      productionNode: node,
      isCircular: false,
      items,
      facilities,
      facilityIndex,
      totalFacilities,
      isPartialLoad,
      isDirectTarget,
      directTargetRate,
      cycleInfo: createCycleInfo(node, detectedCycles, itemMap),
    },
    position: { x: 0, y: 0 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  };
}
