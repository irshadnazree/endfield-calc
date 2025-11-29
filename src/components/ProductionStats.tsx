import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AlertCircle } from "lucide-react";

type ProductionStatsProps = {
  totalPowerConsumption: number;
  productionSteps: number;
  rawMaterialCount: number;
  error: string | null;
};

const ProductionStats = memo(function ProductionStats({
  totalPowerConsumption,
  productionSteps,
  rawMaterialCount,
  error,
}: ProductionStatsProps) {
  return (
    <Card className="flex-shrink-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">生产统计</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <div className="flex items-center gap-2 text-destructive text-sm p-3 bg-destructive/10 rounded">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">总功耗</div>
                <div className="text-lg font-bold">
                  {totalPowerConsumption.toFixed(1)}
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    kW
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">生产步骤</div>
                <div className="text-lg font-bold">{productionSteps}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">原材料</div>
                <div className="text-lg font-bold">{rawMaterialCount}</div>
              </div>
            </div>

            <Separator />
          </>
        )}
      </CardContent>
    </Card>
  );
});

export default ProductionStats;
