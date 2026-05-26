import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { type LucideIcon } from "lucide-react";

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon: LucideIcon;
  fase: string;
}

export function PlaceholderPage({
  title,
  description,
  icon: Icon,
  fase,
}: PlaceholderPageProps) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{description}</p>
      </div>

      <Card className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mb-4">
          <Icon className="w-8 h-8 text-primary-600" />
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">{title}</h2>
        <p className="text-sm text-gray-500 mb-4 max-w-xs">{description}</p>
        <Badge variant="info">{fase}</Badge>
      </Card>
    </div>
  );
}
