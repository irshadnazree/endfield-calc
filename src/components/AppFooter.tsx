import { useTranslation } from "react-i18next";
import { Scale } from "lucide-react";

export default function AppFooter() {
  const { t } = useTranslation("app");

  return (
    <footer className="border-t mt-auto">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-2 text-sm text-muted-foreground">
        {/* Left section*/}
        <div className="flex items-center gap-2 text-xs sm:text-sm">
          <span>{t("footer.feedback")}</span>
          <span>QQ: 1075221296</span>
        </div>

        {/* Right section  */}
        <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
          <span className="flex items-center gap-1">
            <Scale className="h-3 w-3" />
            MIT License
          </span>
          <span className="text-muted-foreground/60">•</span>
          <span>{t("footer.unofficial")}</span>
        </div>
      </div>
    </footer>
  );
}
