import { ItemId, RecipeId, FacilityId } from "./constants";

type Item = {
  id: ItemId;
  iconUrl?: string;
  tier: number;
};

type RecipeItem = {
  itemId: ItemId;
  amount: number;
};

type Recipe = {
  id: RecipeId;
  inputs: RecipeItem[];
  outputs: RecipeItem[];
  facilityId: FacilityId;
  craftingTime: number;
};

type Facility = {
  id: FacilityId;
  powerConsumption: number;
  supportedRecipes: RecipeId[];
  iconUrl?: string;
  tier: number;
};

export type { Item, Recipe, RecipeItem, Facility };

export type { ItemId, RecipeId, FacilityId } from "./constants";
