import i18next from "@/i18n";
import type { Item, Facility } from "@/types";

export const getItemName = (item: Item) => {
  return i18next.t(item.id, { ns: "item", defaultValue: item.id });
};

export const getFacilityName = (facility: Facility) => {
  return i18next.t(facility.id, {
    ns: "facility",
    defaultValue: facility.id,
  });
};
