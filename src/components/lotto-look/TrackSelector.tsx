
"use client";

import * as React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListTree } from "lucide-react";

export interface Track {
  id: string;
  name: string;
  region: "USA" | "Santo Domingo";
  cutoffTime?: string; // Optional, e.g., "12:30 PM"
}

const usaTracks: Track[] = [
  { id: "NYMidDay", name: "New York Mid Day", region: "USA", cutoffTime: "12:20 PM" },
  { id: "NYEvening", name: "New York Evening", region: "USA", cutoffTime: "07:20 PM" },
  { id: "GeorgiaMidDay", name: "Georgia Mid Day", region: "USA", cutoffTime: "12:29 PM" },
  { id: "GeorgiaEvening", name: "Georgia Evening", region: "USA", cutoffTime: "06:59 PM" },
  { id: "NJMidDay", name: "New Jersey Mid Day", region: "USA", cutoffTime: "12:57 PM" },
  { id: "NJEvening", name: "New Jersey Evening", region: "USA", cutoffTime: "07:55 PM" },
  { id: "FloridaMidDay", name: "Florida Mid Day", region: "USA", cutoffTime: "01:28 PM" },
  { id: "FloridaEvening", name: "Florida Evening", region: "USA", cutoffTime: "09:43 PM" },
  { id: "ConnecticutMidDay", name: "Connecticut Mid Day", region: "USA", cutoffTime: "01:28 PM" },
  { id: "ConnecticutEvening", name: "Connecticut Evening", region: "USA", cutoffTime: "10:00 PM" },
  { id: "GeorgiaNight", name: "Georgia Night", region: "USA", cutoffTime: "11:34 PM" },
  { id: "PennsylvaniaAM", name: "Pensilvania AM", region: "USA", cutoffTime: "01:30 PM" },
  { id: "PennsylvaniaPM", name: "Pensilvania PM", region: "USA", cutoffTime: "06:55 PM" },
  { id: "Venezuela", name: "Venezuela", region: "USA" }, // Typically grouped with USA for cross-play
  { id: "BrooklynMidday", name: "Brooklyn Midday", region: "USA" },
  { id: "BrooklynEvening", name: "Brooklyn Evening", region: "USA" },
  { id: "FrontMidday", name: "Front Midday", region: "USA" },
  { id: "FrontEvening", name: "Front Evening", region: "USA" },
  { id: "NYHorses", name: "New York Horses", region: "USA" },
];

const sdTracks: Track[] = [
  { id: "Real", name: "Real", region: "Santo Domingo", cutoffTime: "12:55 PM" },
  { id: "Ganamas", name: "Gana más", region: "Santo Domingo", cutoffTime: "02:55 PM" },
  { id: "Loteka", name: "Loteka", region: "Santo Domingo", cutoffTime: "07:55 PM" },
  { id: "Nacional", name: "Nacional", region: "Santo Domingo", cutoffTime: "08:50 PM" },
  { id: "QuinielaPale", name: "Quiniela Pale", region: "Santo Domingo" }, // Often part of Nacional/Leidsa
  { id: "PrimeraDia", name: "Primera Día", region: "Santo Domingo", cutoffTime: "11:55 AM" },
  { id: "SuerteDia", name: "Suerte Día", region: "Santo Domingo", cutoffTime: "12:25 PM" }, // Example, actual may vary
  { id: "LoteriaReal", name: "Lotería Real", region: "Santo Domingo", cutoffTime: "01:00 PM" }, // This is likely 'Real'
  { id: "SuerteTarde", name: "Suerte Tarde", region: "Santo Domingo", cutoffTime: "05:55 PM" },
  { id: "Lotedom", name: "Lotedom", region: "Santo Domingo", cutoffTime: "01:55 PM" },
  { id: "PrimeraNoche", name: "Primera Noche", region: "Santo Domingo", cutoffTime: "07:55 PM" },
  { id: "Panama", name: "Panamá", region: "Santo Domingo" }, // Sometimes grouped here
];

const allTracks = [...usaTracks, ...sdTracks];

interface TrackSelectorProps {
  selectedTracks: Track[];
  onTracksChange: (tracks: Track[]) => void;
}

export function TrackSelector({ selectedTracks, onTracksChange }: TrackSelectorProps) {
  const handleTrackToggle = (track: Track) => {
    const isSelected = selectedTracks.some(t => t.id === track.id);
    if (isSelected) {
      onTracksChange(selectedTracks.filter(t => t.id !== track.id));
    } else {
      onTracksChange([...selectedTracks, track]);
    }
  };

  const renderTrackButton = (track: Track) => (
    <div key={track.id} className="flex items-center space-x-2 p-2 m-1 border rounded-md hover:bg-accent/10 transition-colors cursor-pointer has-[input:checked]:bg-primary has-[input:checked]:text-primary-foreground">
      <Checkbox
        id={track.id}
        checked={selectedTracks.some(t => t.id === track.id)}
        onCheckedChange={() => handleTrackToggle(track)}
        className="border-primary data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary"
      />
      <Label htmlFor={track.id} className="flex-grow cursor-pointer">
        <span className="font-medium">{track.name}</span>
        {track.cutoffTime && <span className="text-xs opacity-75 ml-2">({track.cutoffTime})</span>}
      </Label>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-primary">
          <ListTree className="h-6 w-6" />
          Select Tracks
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" defaultValue={["usa-tracks", "sd-tracks"]} className="w-full">
          <AccordionItem value="usa-tracks">
            <AccordionTrigger className="text-lg font-semibold hover:no-underline">USA Tracks</AccordionTrigger>
            <AccordionContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2">
              {usaTracks.map(renderTrackButton)}
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="sd-tracks">
            <AccordionTrigger className="text-lg font-semibold hover:no-underline">Santo Domingo Tracks</AccordionTrigger>
            <AccordionContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2">
              {sdTracks.map(renderTrackButton)}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
