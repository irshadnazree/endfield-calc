import { Handle, type NodeProps, Position } from "@xyflow/react";
import type { Node } from "@xyflow/react"; // Add this import
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ItemIcon } from "../ProductionTable";
import { getItemName } from "@/lib/i18n-helpers";
import { useTranslation } from "react-i18next";
import type { TargetSinkNodeData } from "../flow-mapping/types";

/**
 * Formats a number to a fixed number of decimal places.
 *
 * @param num The number to format
 * @param decimals The number of decimal places. Defaults to 2
 * @returns The formatted number as a string
 */
const formatNumber = (num: number, decimals = 2): string => {
  return num.toFixed(decimals);
};

/**
 * CustomTargetNode component renders a virtual sink node representing a user-defined production target.
 *
 * This version uses a standard, distinctively styled Card (rounded rectangle with a strong amber border)
 * for maximum stability and compatibility.
 *
 * @param {NodeProps} props The properties for the target node
 * @returns A React component representing a production target
 */
export default function CustomTargetNode({
  data,
  targetPosition = Position.Left,
}: NodeProps<Node<TargetSinkNodeData>>) {
  const { item, targetRate } = data;
  const { t } = useTranslation("production");

  const itemName = getItemName(item);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Simplified structure: Replaced complex SVG/ForeignObject with a standard Card.
					We use a thick border (border-4) and prominent colors to maintain distinction. */}
        <Card
          className="
						w-52 h-full shadow-xl
						border-4 border-amber-500 dark:border-amber-400
						bg-linear-to-br from-amber-50 to-green-50 dark:from-amber-950/30 dark:to-green-950/30
						hover:shadow-2xl transition-shadow cursor-help relative
					"
          // Removed all clipPath and fixed dimension styles.
        >
          {/* Target handle for incoming connections */}
          <Handle
            type="target"
            position={targetPosition}
            isConnectable={false}
            className="bg-amber-500!"
          />
          <CardContent className="p-3 text-xs">
            {/* Target indicator and item info */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🎯</span>
              <ItemIcon item={item} />
              <span className="font-bold truncate flex-1">{itemName}</span>
            </div>

            {/* Target label */}
            <div className="text-center mb-2">
              <span className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold uppercase tracking-wide">
                {t("tree.target")}
              </span>
            </div>

            {/* Target rate */}
            <div className="flex items-center justify-between bg-amber-100/70 dark:bg-amber-900/50 rounded px-2 py-1">
              <span className="text-muted-foreground text-[10px]">
                {t("tree.targetRate")}
              </span>
              <span className="font-mono font-semibold text-amber-700 dark:text-amber-300">
                {formatNumber(targetRate)} /min
              </span>
            </div>
          </CardContent>
        </Card>
      </TooltipTrigger>
      {/* Tooltip content */}
      <TooltipContent side="right" className="p-2 border shadow-md">
        <div className="text-xs max-w-[200px]">
          <div className="font-bold mb-1">{t("tree.productionTarget")}</div>
          <div className="text-muted-foreground">
            {t("tree.targetDescription", {
              item: itemName,
              rate: formatNumber(targetRate),
            })}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
