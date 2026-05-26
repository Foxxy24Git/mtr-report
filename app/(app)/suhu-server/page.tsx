import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { Thermometer } from "lucide-react";

export default function SuhuServerPage() {
  return (
    <PlaceholderPage
      title="Suhu AC & Log Server"
      description="Pemantauan suhu ruang server 3x/shift dan log kondisi server NPAY, BI-FAST, dll."
      icon={Thermometer}
      fase="Diimplementasikan di Fase 5"
    />
  );
}
