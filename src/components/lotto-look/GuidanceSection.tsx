import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, Camera, Text, Image as ImageIcon, Zap } from "lucide-react";

export function GuidanceSection() {
  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-primary">
          <Lightbulb className="h-6 w-6 text-accent" />
          Tips for Accurate Ticket Photos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex items-start gap-3">
          <Camera className="h-5 w-5 mt-1 text-primary flex-shrink-0" />
          <p><span className="font-semibold">Clear Photo:</span> Ensure the ticket is well-lit and the photo is sharp. Avoid shadows and glare.</p>
        </div>
        <div className="flex items-start gap-3">
          <ImageIcon className="h-5 w-5 mt-1 text-primary flex-shrink-0" />
          <p><span className="font-semibold">Full View:</span> Capture the entire ticket in the frame. Don&apos;t cut off edges or corners.</p>
        </div>
        <div className="flex items-start gap-3">
          <Text className="h-5 w-5 mt-1 text-primary flex-shrink-0" />
          <p><span className="font-semibold">Legible Handwriting:</span> The clearer the handwriting, the better the interpretation. Use dark ink on light paper if possible.</p>
        </div>
        <div className="flex items-start gap-3">
          <Zap className="h-5 w-5 mt-1 text-primary flex-shrink-0" />
          <p><span className="font-semibold">Flat Surface:</span> Place the ticket on a flat, contrasting surface before taking the photo.</p>
        </div>
      </CardContent>
    </Card>
  );
}
