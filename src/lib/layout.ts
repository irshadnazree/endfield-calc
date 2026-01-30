import { type Node, type Edge, Position } from "@xyflow/react";
import type { FlowProductionNode } from "@/types";

interface ElkNode {
  id: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  layoutOptions?: Record<string, string>;
  children?: ElkNode[];
}

interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  layoutOptions?: Record<string, string>;
}

interface ElkGraph {
  id: string;
  layoutOptions?: Record<string, string>;
  children?: ElkNode[];
  edges?: ElkEdge[];
}

let elkInstance: { layout: (graph: ElkGraph) => Promise<ElkNode> } | null =
  null;
let elkPromise: Promise<{
  layout: (graph: ElkGraph) => Promise<ElkNode>;
}> | null = null;

const NODE_DIMENSIONS = {
  RAW_MATERIAL_NODE: { width: 208, height: 125 },
  PRODUCTION_NODE: { width: 208, height: 125 },
  PRODUCTION_NODE_PARTIAL: { width: 208, height: 157 },
  TARGET_NODE: { width: 208, height: 160 },
} as const;

/**
 * Initiates the loading of ELKJS.
 * This can be called early to preload the 1.4MB bundle in the background.
 */
export const preloadLayoutEngine = () => {
  if (!elkPromise) {
    elkPromise = import("elkjs/lib/elk.bundled.js").then(
      (m) => new m.default(),
    );
  }
  return elkPromise;
};

// Start preloading immediately when this utility module is imported
preloadLayoutEngine();

/**
 * Determines the appropriate dimensions for a node based on its type and data.
 */
function getNodeDimensions(node: Node): { width: number; height: number } {
  if (node.type === "targetSink") {
    return NODE_DIMENSIONS.TARGET_NODE;
  }

  if (node.type === "productionNode") {
    const prodNode = node as FlowProductionNode;

    // Check if it's a raw material node
    if (prodNode.data.productionNode.isRawMaterial) {
      const isPartialLoad =
        "isPartialLoad" in prodNode.data && prodNode.data.isPartialLoad;
      return isPartialLoad
        ? NODE_DIMENSIONS.PRODUCTION_NODE_PARTIAL
        : NODE_DIMENSIONS.RAW_MATERIAL_NODE;
    }

    // Check if it's separated mode with partial load
    const isPartialLoad =
      "isPartialLoad" in prodNode.data && prodNode.data.isPartialLoad;
    return isPartialLoad
      ? NODE_DIMENSIONS.PRODUCTION_NODE_PARTIAL
      : NODE_DIMENSIONS.PRODUCTION_NODE;
  }

  // Fallback
  return NODE_DIMENSIONS.PRODUCTION_NODE;
}

/**
 * Lays out React Flow elements using the ELK algorithm.
 * ELK provides better handling of hierarchy and complex cycles than Dagre.
 * Uses static node dimensions for consistent and immediate layout.
 */
export const getLayoutedElements = async (
  nodes: Node[],
  edges: Edge[],
  direction = "RIGHT",
) => {
  // Ensure the engine is loaded
  if (!elkInstance) {
    elkInstance = await preloadLayoutEngine();
  }

  const isHorizontal = direction === "RIGHT" || direction === "LEFT";

  const elkGraph: ElkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.layered.spacing.nodeNodeBetweenLayers": "150",
      "elk.spacing.nodeNode": "100",
      "elk.edgeRouting": "SPLINES",
      "elk.layered.feedbackEdges": "true",
      "elk.layered.nodePlacement.favorStraightEdges": "0.2",
      "elk.layered.unnecessaryBendpoints": "true",
      "org.eclipse.elk.padding": "[top=40,left=40,bottom=40,right=40]",
    },
    children: nodes.map((node) => {
      const dimensions = getNodeDimensions(node);
      return {
        id: node.id,
        width: dimensions.width,
        height: dimensions.height,
      };
    }),
    edges: edges.map((edge) => {
      const isBackward =
        edge.type === "backwardEdge" || edge.data?.direction === "backward";

      return {
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
        layoutOptions: {
          "elk.layered.priority.direction": isBackward ? "-10" : "10",
        },
      };
    }),
  };

  try {
    const layoutedGraph = await elkInstance!.layout(elkGraph);

    const layoutedNodes = nodes.map((node) => {
      const elkNode = layoutedGraph.children?.find((n) => n.id === node.id);

      if (!elkNode) return node;

      const dimensions = getNodeDimensions(node);
      return {
        ...node,
        position: {
          x: elkNode.x ?? 0,
          y: elkNode.y ?? 0,
        },
        width: dimensions.width,
        height: dimensions.height,
        targetPosition: isHorizontal ? Position.Left : Position.Top,
        sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      };
    });

    return { nodes: layoutedNodes, edges };
  } catch (error) {
    console.error("ELK layout failed:", error);
    return { nodes, edges };
  }
};
