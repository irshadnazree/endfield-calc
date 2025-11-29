import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TargetItemsGrid, { type ProductionTarget } from "./TargetItemsGrid";
import ProductionStats from "./ProductionStats";
import type { Item } from "@/types";

type LeftPanelProps = {
  targets: ProductionTarget[];
  items: Item[];
  totalPowerConsumption: number;
  productionSteps: number;
  rawMaterialCount: number;
  error: string | null;
  onTargetChange: (index: number, rate: number) => void;
  onTargetRemove: (index: number) => void;
  onAddClick: () => void;
  language?: "en" | "zh-CN" | "zh-TW";
};

const LeftPanel = memo(function LeftPanel({
  targets,
  items,
  totalPowerConsumption,
  productionSteps,
  rawMaterialCount,
  error,
  onTargetChange,
  onTargetRemove,
  onAddClick,
  language = "zh-CN",
}: LeftPanelProps) {
  return (
    <div className="w-[420px] flex flex-col gap-4 min-h-0">
      <Card className="flex-shrink-0">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">生产目标</CardTitle>
            <div className="text-xs text-muted-foreground">
              {targets.length} / 12
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <TargetItemsGrid
            targets={targets}
            items={items}
            onTargetChange={onTargetChange}
            onTargetRemove={onTargetRemove}
            onAddClick={onAddClick}
            language={language}
          />
        </CardContent>
      </Card>

      <ProductionStats
        totalPowerConsumption={totalPowerConsumption}
        productionSteps={productionSteps}
        rawMaterialCount={rawMaterialCount}
        error={error}
      />
    </div>
  );
});

export default LeftPanel;
