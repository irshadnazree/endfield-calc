import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { Item, ItemId } from "@/types";
import { useTranslation } from "react-i18next";
import { getItemName } from "@/lib/i18n-helpers";

type AddTargetDialogGridProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: Item[];
  existingTargetIds: ItemId[];
  onAddTarget: (itemId: ItemId, rate: number) => void;
};

export default function AddTargetDialogGrid({
  open,
  onOpenChange,
  items,
  existingTargetIds,
  onAddTarget,
}: AddTargetDialogGridProps) {
  const { t } = useTranslation("dialog");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<ItemId | null>(null);
  const [defaultRate, setDefaultRate] = useState(10);

  const availableItems = items.filter(
    (item) => !existingTargetIds.includes(item.id),
  );

  const filteredItems = availableItems.filter((item) => {
    const name = getItemName(item).toLowerCase();
    const query = searchQuery.toLowerCase();
    return name.includes(query) || item.id.toLowerCase().includes(query);
  });

  const handleAddTarget = () => {
    if (selectedItemId) {
      onAddTarget(selectedItemId, defaultRate);
      setSelectedItemId(null);
      setSearchQuery("");
      onOpenChange(false);
    }
  };

  const handleItemClick = (itemId: ItemId) => {
    setSelectedItemId(itemId);
  };

  const handleItemDoubleClick = (itemId: ItemId) => {
    onAddTarget(itemId, defaultRate);
    setSelectedItemId(null);
    setSearchQuery("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] flex flex-col overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 flex flex-col">
          {/* 搜索框和默认产量 */}
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">
                {t("defaultRate")}:
              </Label>
              <Input
                type="number"
                value={defaultRate}
                onChange={(e) => setDefaultRate(Number(e.target.value))}
                className="h-9 w-24"
                min="0.1"
                step="0.1"
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {t("rateUnit")}
              </span>
            </div>
          </div>

          {/* 物品网格 */}
          <ScrollArea className="flex-1 rounded-md border p-3">
            {filteredItems.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">
                  {availableItems.length === 0
                    ? t("allItemsAdded")
                    : t("noMatchingItems")}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {filteredItems.map((item) => (
                  <Card
                    key={item.id}
                    className={`cursor-pointer hover:shadow-md transition-all ${
                      selectedItemId === item.id
                        ? "ring-2 ring-primary bg-accent"
                        : "hover:bg-accent/50"
                    }`}
                    onClick={() => handleItemClick(item.id)}
                    onDoubleClick={() => handleItemDoubleClick(item.id)}
                  >
                    <div className="p-2 flex flex-row items-center gap-3 h-16">
                      {item.iconUrl ? (
                        <div className="h-12 w-12 flex-shrink-0 flex items-center justify-center">
                          <img
                            src={item.iconUrl}
                            alt={getItemName(item)}
                            className="h-full w-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="h-12 w-12 flex-shrink-0 bg-muted rounded flex items-center justify-center">
                          <span className="text-xs text-muted-foreground">
                            {t("noIcon")}
                          </span>
                        </div>
                      )}
                      <div className="text-sm text-left line-clamp-2 flex-1 min-w-0">
                        {getItemName(item)}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* 底部提示和按钮 */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="text-xs text-muted-foreground">
              {t("hint", {
                selected: selectedItemId
                  ? getItemName(items.find((i) => i.id === selectedItemId)!)
                  : t("noneSelected"),
              })}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Button>
              <Button onClick={handleAddTarget} disabled={!selectedItemId}>
                {t("add")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
