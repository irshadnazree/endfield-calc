import type {
  Item,
  Recipe,
  Facility,
  ItemId,
  RecipeId,
  FacilityId,
  ProductionNode,
  DetectedCycle,
  ProductionDependencyGraph,
  ProductionGraphNode,
} from "@/types";
import { solveLinearSystem } from "./linear-solver";
import { forcedRawMaterials } from "@/data";
import { calcRate } from "@/lib/utils";

const selectRecipe = (recipes: Recipe[], visitedPath: Set<ItemId>): Recipe => {
  // Priority 1: Recipes with single output (no byproducts)
  const singleOutput = recipes.filter((r) => r.outputs.length === 1);

  if (singleOutput.length > 0) {
    // Priority 2: Among single-output recipes, prefer non-circular ones
    if (visitedPath.size > 0) {
      const nonCircular = singleOutput.filter(
        (r) => !r.inputs.some((input) => visitedPath.has(input.itemId)),
      );

      if (nonCircular.length > 0) {
        return nonCircular[0];
      }
    }

    // Priority 3: Return first single-output recipe
    return singleOutput[0];
  }

  // Priority 4: If no single-output recipes, prefer non-circular
  if (visitedPath.size > 0) {
    const nonCircular = recipes.filter(
      (r) => !r.inputs.some((input) => visitedPath.has(input.itemId)),
    );

    if (nonCircular.length > 0) {
      return nonCircular[0];
    }
  }

  // Priority 5: Default to first available recipe
  return recipes[0];
};

type ProductionMaps = {
  itemMap: Map<ItemId, Item>;
  recipeMap: Map<RecipeId, Recipe>;
  facilityMap: Map<FacilityId, Facility>;
};

type ItemNode = {
  itemId: ItemId;
  item: Item;
  isRawMaterial: boolean;
};

type RecipeNodeData = {
  recipeId: RecipeId;
  recipe: Recipe;
  facility: Facility;
};

type BipartiteGraph = {
  itemNodes: Map<ItemId, ItemNode>;
  recipeNodes: Map<RecipeId, RecipeNodeData>;

  itemConsumedBy: Map<ItemId, Set<RecipeId>>;
  itemProducedBy: Map<ItemId, RecipeId>;

  recipeInputs: Map<RecipeId, Set<ItemId>>;
  recipeOutputs: Map<RecipeId, Set<ItemId>>;

  targets: Set<ItemId>;
  rawMaterials: Set<ItemId>;
};
type SCCInfo = {
  id: string;
  items: Set<ItemId>;
  recipes: Set<RecipeId>;
  externalInputs: Set<ItemId>;
};

type CondensedNode =
  | { type: "item"; itemId: ItemId }
  | { type: "recipe"; recipeId: RecipeId }
  | { type: "scc"; scc: SCCInfo };

type FlowData = {
  itemDemands: Map<ItemId, number>;
  recipeFacilityCounts: Map<RecipeId, number>;
};

const getOrThrow = <K, V>(map: Map<K, V>, key: K, type: string): V => {
  const value = map.get(key);
  if (!value) throw new Error(`${type} not found: ${key}`);
  return value;
};

function buildBipartiteGraph(
  targets: Array<{ itemId: ItemId; rate: number }>,
  maps: ProductionMaps,
  recipeOverrides?: Map<ItemId, RecipeId>,
  manualRawMaterials?: Set<ItemId>,
): BipartiteGraph {
  const graph: BipartiteGraph = {
    itemNodes: new Map(),
    recipeNodes: new Map(),
    itemConsumedBy: new Map(),
    itemProducedBy: new Map(),
    recipeInputs: new Map(),
    recipeOutputs: new Map(),
    targets: new Set(targets.map((t) => t.itemId)),
    rawMaterials: new Set(),
  };

  const visitedItems = new Set<ItemId>();

  function traverse(itemId: ItemId, visitedPath: Set<ItemId>) {
    if (visitedItems.has(itemId)) return;
    visitedItems.add(itemId);

    const item = getOrThrow(maps.itemMap, itemId, "Item");

    const isRaw =
      forcedRawMaterials.has(itemId) ||
      (manualRawMaterials?.has(itemId) ?? false);

    graph.itemNodes.set(itemId, {
      itemId,
      item,
      isRawMaterial: isRaw,
    });

    if (isRaw) {
      graph.rawMaterials.add(itemId);
      return;
    }

    const availableRecipes = Array.from(maps.recipeMap.values()).filter((r) =>
      r.outputs.some((o) => o.itemId === itemId),
    );

    if (availableRecipes.length === 0) {
      graph.itemNodes.get(itemId)!.isRawMaterial = true;
      graph.rawMaterials.add(itemId);
      return;
    }

    const selectedRecipe = recipeOverrides?.has(itemId)
      ? getOrThrow(
          maps.recipeMap,
          recipeOverrides.get(itemId)!,
          "Override recipe",
        )
      : selectRecipe(availableRecipes, visitedPath);

    const facility = getOrThrow(
      maps.facilityMap,
      selectedRecipe.facilityId,
      "Facility",
    );

    if (!graph.recipeNodes.has(selectedRecipe.id)) {
      graph.recipeNodes.set(selectedRecipe.id, {
        recipeId: selectedRecipe.id,
        recipe: selectedRecipe,
        facility,
      });

      graph.recipeInputs.set(selectedRecipe.id, new Set());
      graph.recipeOutputs.set(selectedRecipe.id, new Set());
    }

    selectedRecipe.outputs.forEach((out) => {
      graph.recipeOutputs.get(selectedRecipe.id)!.add(out.itemId);
      graph.itemProducedBy.set(out.itemId, selectedRecipe.id);
    });

    graph.itemProducedBy.set(itemId, selectedRecipe.id);

    const newVisitedPath = new Set(visitedPath);
    newVisitedPath.add(itemId);

    selectedRecipe.inputs.forEach((input) => {
      graph.recipeInputs.get(selectedRecipe.id)!.add(input.itemId);

      if (!graph.itemConsumedBy.has(input.itemId)) {
        graph.itemConsumedBy.set(input.itemId, new Set());
      }
      graph.itemConsumedBy.get(input.itemId)!.add(selectedRecipe.id);

      traverse(input.itemId, newVisitedPath);
    });
  }

  targets.forEach(({ itemId }) => traverse(itemId, new Set()));

  return graph;
}

function detectSCCs(graph: BipartiteGraph): SCCInfo[] {
  const sccs: SCCInfo[] = [];
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  let index = 0;

  function strongConnect(nodeId: string, nodeType: "item" | "recipe") {
    indices.set(nodeId, index);
    lowlinks.set(nodeId, index);
    index++;
    stack.push(nodeId);
    onStack.add(nodeId);

    const successors: Array<[string, "item" | "recipe"]> = [];

    if (nodeType === "item") {
      const consumerRecipes = graph.itemConsumedBy.get(nodeId as ItemId);
      if (consumerRecipes) {
        consumerRecipes.forEach((recipeId) => {
          successors.push([recipeId, "recipe"]);
        });
      }
    } else {
      const outputs = graph.recipeOutputs.get(nodeId as RecipeId);
      if (outputs) {
        outputs.forEach((itemId) => {
          successors.push([itemId, "item"]);
        });
      }
    }

    successors.forEach(([succId, succType]) => {
      if (!indices.has(succId)) {
        strongConnect(succId, succType);
        lowlinks.set(
          nodeId,
          Math.min(lowlinks.get(nodeId)!, lowlinks.get(succId)!),
        );
      } else if (onStack.has(succId)) {
        lowlinks.set(
          nodeId,
          Math.min(lowlinks.get(nodeId)!, indices.get(succId)!),
        );
      }
    });

    if (lowlinks.get(nodeId) === indices.get(nodeId)) {
      const sccItems = new Set<ItemId>();
      const sccRecipes = new Set<RecipeId>();

      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);

        if (graph.itemNodes.has(w as ItemId)) {
          sccItems.add(w as ItemId);
        } else {
          sccRecipes.add(w as RecipeId);
        }
      } while (w !== nodeId);

      if (sccItems.size + sccRecipes.size > 1) {
        const externalInputs = new Set<ItemId>();

        sccRecipes.forEach((recipeId) => {
          const inputs = graph.recipeInputs.get(recipeId) || new Set();
          inputs.forEach((inputItemId) => {
            if (!sccItems.has(inputItemId)) {
              externalInputs.add(inputItemId);
            }
          });
        });

        const sccInfo: SCCInfo = {
          id: `scc-${Array.from(sccItems).sort().join("-")}`,
          items: sccItems,
          recipes: sccRecipes,
          externalInputs,
        };

        // LOG: SCC detected
        console.log(`[SCC] Detected cycle: ${sccInfo.id}`);
        console.log(`  Items (${sccItems.size}):`, Array.from(sccItems));
        console.log(`  Recipes (${sccRecipes.size}):`, Array.from(sccRecipes));
        console.log(
          `  External inputs (${externalInputs.size}):`,
          Array.from(externalInputs),
        );

        sccs.push(sccInfo);
      }
    }
  }

  graph.itemNodes.forEach((_, itemId) => {
    if (!indices.has(itemId)) {
      strongConnect(itemId, "item");
    }
  });

  console.log(`[SCC] Total SCCs detected: ${sccs.length}`);
  return sccs;
}

function buildCondensedDAGAndSort(
  graph: BipartiteGraph,
  sccs: SCCInfo[],
): CondensedNode[] {
  const nodeToSCC = new Map<string, string>();

  sccs.forEach((scc) => {
    scc.items.forEach((itemId) => nodeToSCC.set(itemId, scc.id));
    scc.recipes.forEach((recipeId) => nodeToSCC.set(recipeId, scc.id));
  });

  const condensedNodes = new Map<string, CondensedNode>();
  const condensedEdges = new Map<string, Set<string>>();

  sccs.forEach((scc) => {
    condensedNodes.set(scc.id, { type: "scc", scc });
    condensedEdges.set(scc.id, new Set());
  });

  graph.itemNodes.forEach((_, itemId) => {
    if (!nodeToSCC.has(itemId)) {
      condensedNodes.set(itemId, { type: "item", itemId });
      condensedEdges.set(itemId, new Set());
    }
  });

  graph.recipeNodes.forEach((_, recipeId) => {
    if (!nodeToSCC.has(recipeId)) {
      condensedNodes.set(recipeId, { type: "recipe", recipeId });
      condensedEdges.set(recipeId, new Set());
    }
  });

  const addEdge = (fromId: string, toId: string) => {
    const fromCondensed = nodeToSCC.get(fromId) || fromId;
    const toCondensed = nodeToSCC.get(toId) || toId;

    if (fromCondensed !== toCondensed) {
      condensedEdges.get(fromCondensed)!.add(toCondensed);
    }
  };

  graph.itemConsumedBy.forEach((recipeIds, itemId) => {
    recipeIds.forEach((recipeId) => {
      addEdge(itemId, recipeId);
    });
  });

  graph.recipeOutputs.forEach((itemIds, recipeId) => {
    itemIds.forEach((itemId) => {
      addEdge(recipeId, itemId);
    });
  });

  const inDegree = new Map<string, number>();
  condensedNodes.forEach((_, nodeId) => {
    inDegree.set(nodeId, 0);
  });

  condensedEdges.forEach((targets) => {
    targets.forEach((target) => {
      inDegree.set(target, (inDegree.get(target) || 0) + 1);
    });
  });

  const queue: string[] = [];
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) queue.push(nodeId);
  });

  const topoOrder: CondensedNode[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    topoOrder.push(condensedNodes.get(nodeId)!);

    condensedEdges.get(nodeId)!.forEach((target) => {
      const newDegree = inDegree.get(target)! - 1;
      inDegree.set(target, newDegree);
      if (newDegree === 0) {
        queue.push(target);
      }
    });
  }

  return topoOrder;
}

function calculateFlows(
  graph: BipartiteGraph,
  condensedOrder: CondensedNode[],
  targetRates: Map<ItemId, number>,
  maps: ProductionMaps,
): FlowData {
  const itemDemands = new Map<ItemId, number>();
  const recipeFacilityCounts = new Map<RecipeId, number>();

  targetRates.forEach((rate, itemId) => {
    itemDemands.set(itemId, rate);
  });

  const reversedOrder = condensedOrder.reverse();

  console.log(
    `[FLOW] Processing ${reversedOrder.length} condensed nodes in topological order`,
  );

  reversedOrder.forEach((node, idx) => {
    if (node.type === "scc") {
      console.log(`[FLOW] [${idx}] Processing SCC: ${node.scc.id}`);
      solveSCCFlow(node.scc, graph, itemDemands, recipeFacilityCounts, maps);
    } else if (node.type === "recipe") {
      console.log(`[FLOW] [${idx}] Processing recipe: ${node.recipeId}`);
      const recipeData = graph.recipeNodes.get(node.recipeId)!;
      const recipe = recipeData.recipe;

      const outputs = graph.recipeOutputs.get(node.recipeId)!;

      let facilityCount = 0;

      outputs.forEach((itemId) => {
        const demand = itemDemands.get(itemId) || 0;
        const output = recipe.outputs.find((o) => o.itemId === itemId);
        if (!output) return;

        const rate = calcRate(output.amount, recipe.craftingTime);
        if (rate > 0) {
          facilityCount = Math.max(facilityCount, demand / rate);
        }
      });

      recipeFacilityCounts.set(node.recipeId, facilityCount);
      console.log(`  Facility count: ${facilityCount.toFixed(4)}`);

      recipe.inputs.forEach((input) => {
        const inputDemand =
          calcRate(input.amount, recipe.craftingTime) * facilityCount;
        itemDemands.set(
          input.itemId,
          (itemDemands.get(input.itemId) || 0) + inputDemand,
        );
      });
    } else if (node.type === "item") {
      console.log(`[FLOW] [${idx}] Processing item: ${node.itemId}`);
    }
  });

  return { itemDemands, recipeFacilityCounts };
}

function solveSCCFlow(
  scc: SCCInfo,
  graph: BipartiteGraph,
  itemDemands: Map<ItemId, number>,
  recipeFacilityCounts: Map<RecipeId, number>,
  maps: ProductionMaps,
) {
  console.log(`[SCC_SOLVE] Solving flow for SCC: ${scc.id}`);

  const externalDemands = new Map<ItemId, number>();

  // Calculate external demands for each item in the SCC
  scc.items.forEach((itemId) => {
    let demand = 0;

    // Demand from recipes outside the SCC
    const consumers = graph.itemConsumedBy.get(itemId);
    if (consumers) {
      consumers.forEach((recipeId) => {
        if (!scc.recipes.has(recipeId)) {
          const facilityCount = recipeFacilityCounts.get(recipeId) || 0;
          const recipe = maps.recipeMap.get(recipeId)!;
          const input = recipe.inputs.find((i) => i.itemId === itemId);
          if (input) {
            const consumption =
              calcRate(input.amount, recipe.craftingTime) * facilityCount;
            demand += consumption;
            console.log(
              `    Item ${itemId} consumed by external recipe ${recipeId}: ${consumption.toFixed(4)}`,
            );
          }
        }
      });
    }

    // Demand from target items
    if (graph.targets.has(itemId)) {
      const targetDemand = itemDemands.get(itemId) || 0;
      demand += targetDemand;
      console.log(
        `    Item ${itemId} is target with demand: ${targetDemand.toFixed(4)}`,
      );
    }

    if (demand > 0) {
      externalDemands.set(itemId, demand);
    }
  });

  console.log(`  External demands count: ${externalDemands.size}`);
  externalDemands.forEach((demand, itemId) => {
    console.log(`    ${itemId}: ${demand.toFixed(4)}/min`);
  });

  // Early exit if no external demand
  if (externalDemands.size === 0) {
    console.log(
      `  [SCC_SOLVE] No external demand, skipping this SCC (bad cycle)`,
    );
    return;
  }

  const itemsList = Array.from(scc.items);
  const recipesList = Array.from(scc.recipes).map(
    (rid) => maps.recipeMap.get(rid)!,
  );

  const n = itemsList.length;
  const m = recipesList.length;

  console.log(`  Building linear system: ${n} items × ${m} recipes`);

  if (m === 0 || n === 0) {
    console.log(`  [SCC_SOLVE] Empty system, skipping`);
    return;
  }

  const matrix: number[][] = [];
  const constants: number[] = [];

  // Build linear equation system
  for (let i = 0; i < n; i++) {
    const itemId = itemsList[i];
    const row = new Array(m).fill(0);

    for (let j = 0; j < m; j++) {
      const recipe = recipesList[j];
      const output =
        recipe.outputs.find((o) => o.itemId === itemId)?.amount || 0;
      const input =
        recipe.inputs.find((inp) => inp.itemId === itemId)?.amount || 0;

      const outRate = (output * 60) / recipe.craftingTime;
      const inRate = (input * 60) / recipe.craftingTime;
      row[j] = outRate - inRate;
    }

    matrix.push(row);
    constants.push(externalDemands.get(itemId) || 0);

    console.log(
      `    Equation ${i} (${itemId}):`,
      row.map((v, j) => `${v.toFixed(2)}*r${j}`).join(" + "),
      `= ${constants[i].toFixed(4)}`,
    );
  }

  // Solve the system
  const solution = solveLinearSystem(matrix, constants);

  if (!solution) {
    console.warn(
      `  [SCC_SOLVE] Cannot solve SCC ${scc.id} - system has no solution`,
    );
    return;
  }

  console.log(`  Solution found:`);
  for (let j = 0; j < m; j++) {
    const facilityCount = Math.max(0, solution[j]);
    recipeFacilityCounts.set(recipesList[j].id, facilityCount);
    console.log(
      `    Recipe ${recipesList[j].id}: ${facilityCount.toFixed(4)} facilities`,
    );
  }

  // Propagate demands to external inputs
  scc.externalInputs.forEach((inputItemId) => {
    let totalConsumption = 0;

    scc.recipes.forEach((recipeId) => {
      const recipe = maps.recipeMap.get(recipeId)!;
      const facilityCount = recipeFacilityCounts.get(recipeId) || 0;
      const input = recipe.inputs.find((i) => i.itemId === inputItemId);

      if (input) {
        const consumption =
          calcRate(input.amount, recipe.craftingTime) * facilityCount;
        totalConsumption += consumption;
      }
    });

    if (totalConsumption > 0) {
      itemDemands.set(
        inputItemId,
        (itemDemands.get(inputItemId) || 0) + totalConsumption,
      );
      console.log(
        `  External input ${inputItemId} demand increased by: ${totalConsumption.toFixed(4)}/min`,
      );
    }
  });
}

function buildProductionGraph(
  graph: BipartiteGraph,
  flowData: FlowData,
  sccs: SCCInfo[],
  maps: ProductionMaps,
): ProductionDependencyGraph {
  const nodes = new Map<string, ProductionGraphNode>();
  const edges: Array<{ from: string; to: string }> = [];

  // Add item nodes
  graph.itemNodes.forEach((itemNode, itemId) => {
    const producerRecipeId = graph.itemProducedBy.get(itemId);
    let productionRate = 0;

    if (producerRecipeId) {
      // Produced item: calculate from recipe
      const recipe = maps.recipeMap.get(producerRecipeId)!;
      const facilityCount =
        flowData.recipeFacilityCounts.get(producerRecipeId) || 0;
      const output = recipe.outputs[0];
      productionRate =
        calcRate(output.amount, recipe.craftingTime) * facilityCount;
    } else if (itemNode.isRawMaterial) {
      productionRate = flowData.itemDemands.get(itemId) || 0;
    }

    nodes.set(itemId, {
      type: "item",
      itemId,
      item: itemNode.item,
      productionRate,
      isRawMaterial: itemNode.isRawMaterial,
      isTarget: graph.targets.has(itemId),
    });
  });
  // Add recipe nodes
  graph.recipeNodes.forEach((recipeData, recipeId) => {
    nodes.set(recipeId, {
      type: "recipe",
      recipeId,
      recipe: recipeData.recipe,
      facility: recipeData.facility,
      facilityCount: flowData.recipeFacilityCounts.get(recipeId) || 0,
    });
  });

  // Build edges: Item → Recipe (consume)
  graph.itemConsumedBy.forEach((recipeIds, itemId) => {
    recipeIds.forEach((recipeId) => {
      edges.push({ from: itemId, to: recipeId });
    });
  });

  // Build edges: Recipe → Item (produce)
  graph.recipeOutputs.forEach((itemIds, recipeId) => {
    itemIds.forEach((itemId) => {
      edges.push({ from: recipeId, to: itemId });
    });
  });

  // Build cycle info
  const detectedCycles: DetectedCycle[] = sccs.map((scc) => {
    const cycleNodes: ProductionNode[] = Array.from(scc.recipes).flatMap(
      (recipeId) => {
        const recipeData = graph.recipeNodes.get(recipeId)!;
        const facilityCount = flowData.recipeFacilityCounts.get(recipeId) || 0;
        const outputs = recipeData.recipe.outputs;

        return outputs.map((out) => ({
          item: graph.itemNodes.get(out.itemId)!.item,
          targetRate:
            calcRate(out.amount, recipeData.recipe.craftingTime) *
            facilityCount,
          recipe: recipeData.recipe,
          facility: recipeData.facility,
          facilityCount,
          isRawMaterial: false,
          isTarget: false,
          dependencies: [],
        }));
      },
    );

    return {
      cycleId: scc.id,
      involvedItemIds: Array.from(scc.items),
      breakPointItemId: Array.from(scc.items)[0],
      cycleNodes,
      netOutputs: new Map(),
    };
  });

  return {
    nodes,
    edges,
    targets: graph.targets,
    detectedCycles,
  };
}

export function calculateProductionPlan(
  targets: Array<{ itemId: ItemId; rate: number }>,
  items: Item[],
  recipes: Recipe[],
  facilities: Facility[],
  recipeOverrides?: Map<ItemId, RecipeId>,
  manualRawMaterials?: Set<ItemId>,
): ProductionDependencyGraph {
  if (targets.length === 0) throw new Error("No targets specified");

  const maps: ProductionMaps = {
    itemMap: new Map(items.map((i) => [i.id, i])),
    recipeMap: new Map(recipes.map((r) => [r.id, r])),
    facilityMap: new Map(facilities.map((f) => [f.id, f])),
  };

  const graph = buildBipartiteGraph(
    targets,
    maps,
    recipeOverrides,
    manualRawMaterials,
  );

  const sccs = detectSCCs(graph);
  const condensedOrder = buildCondensedDAGAndSort(graph, sccs);
  const targetRatesMap = new Map(targets.map((t) => [t.itemId, t.rate]));
  const flowData = calculateFlows(graph, condensedOrder, targetRatesMap, maps);

  return buildProductionGraph(graph, flowData, sccs, maps);
}
