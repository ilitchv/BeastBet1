
"use client";

import { useState, useMemo, useEffect, useRef } from 'react';
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { ImageUploadForm } from '@/components/lotto-look/ImageUploadForm';
import { BetTable } from '@/components/lotto-look/BetTable';
import { DatePickerWithRange } from '@/components/lotto-look/DatePickerWithRange';
import { TrackSelector, type Track } from '@/components/lotto-look/TrackSelector';
import { ThemeToggle } from '@/components/lotto-look/ThemeToggle';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Ticket, AlertCircle, CalendarDays, ListChecksIcon, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { InterpretLotteryTicketOutput as AIOutputType, ParsedBet } from '@/ai/flows/interpret-lottery-ticket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// Updated Bet type to match ParsedBet from the AI flow
export type Bet = ParsedBet;

export default function LottoLookPage() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const [selectedDates, setSelectedDates] = useState<DateRange | undefined>(undefined);
  const [selectedTracks, setSelectedTracks] = useState<Track[]>([]);
  
  const [aiIdentifiedDate, setAiIdentifiedDate] = useState<string | undefined>(undefined);
  const [aiIdentifiedTrack, setAiIdentifiedTrack] = useState<string | undefined>(undefined);


  useEffect(() => {
    setSelectedDates({
      from: new Date(),
      to: new Date(),
    });
  }, []);

  const handleInterpretSuccess = (aiOutput: AIOutputType) => {
    setIsLoading(false); // Set loading to false immediately

    if (!aiOutput) {
      handleInterpretError("AI did not return a valid response structure (received undefined/null).");
      return;
    }

    if (!Array.isArray(aiOutput.parsedBets)) {
      console.error("AI response received, but 'parsedBets' is not an array or is missing. Received:", JSON.stringify(aiOutput, null, 2));
      setBets([]);
      setAiIdentifiedDate(aiOutput.ticketDate || undefined); 
      setAiIdentifiedTrack(aiOutput.identifiedTrack || undefined);
      setError("AI response structure was invalid (bets data is missing or not an array). Please try again.");
      toast({
        variant: "destructive",
        title: "Interpretation Error",
        description: "Received an invalid response from the AI (bets data is missing or malformed).",
      });
      return;
    }

    const processedBets = aiOutput.parsedBets.map(bet => ({
      numeros: bet.numeros || "",
      straight: typeof bet.straight === 'number' ? bet.straight : null,
      box: typeof bet.box === 'number' ? bet.box : null,
      combo: typeof bet.combo === 'number' ? bet.combo : null,
      notas: bet.notas || undefined,
    }));

    setBets(processedBets);
    setAiIdentifiedDate(aiOutput.ticketDate);
    setAiIdentifiedTrack(aiOutput.identifiedTrack);
    setError(null);
    toast({
      title: "Success!",
      description: "Lottery ticket interpreted. Review and edit bets.",
      className: "bg-green-500 text-white dark:bg-green-700",
    });
  };

  const handleInterpretError = (errorMessage: string) => {
    setError(errorMessage);
    setBets([]);
    setAiIdentifiedDate(undefined);
    setAiIdentifiedTrack(undefined);
    setIsLoading(false);
    toast({
      variant: "destructive",
      title: "Interpretation Error",
      description: errorMessage,
    });
  };

  const handleBetsChange = (updatedBets: Bet[]) => {
    setBets(updatedBets);
  };
  
  const handleAddPlay = () => {
    setBets(prevBets => [...prevBets, { numeros: "", straight: null, box: null, combo: null, notas: undefined }]);
  };

  const handleRemoveLastPlay = () => {
    setBets(prevBets => prevBets.slice(0, -1));
  };

  const handleResetForm = () => {
    setBets([]);
    setSelectedDates({ from: new Date(), to: new Date() });
    setSelectedTracks([]);
    setAiIdentifiedDate(undefined);
    setAiIdentifiedTrack(undefined);
    setError(null);
    setIsLoading(false);
    toast({
      title: "Form Reset",
      description: "All fields have been cleared.",
    });
  };


  const overallTotal = useMemo(() => {
    return bets.reduce((acc, bet) => {
      const rowTotal = (bet.straight || 0) + (bet.box || 0) + (bet.combo || 0);
      return acc + rowTotal;
    }, 0);
  }, [bets]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center p-4 md:p-8 selection:bg-primary/20">
      <header className="w-full max-w-4xl mx-auto flex justify-between items-center py-4">
        <div className="inline-flex items-center justify-center p-2 bg-primary text-primary-foreground rounded-full shadow-md">
          <Ticket className="h-8 w-8" />
        </div>
        <h1 className="text-2xl md:text-4xl font-extrabold text-primary tracking-tight">
          Beast Reader (Cricket) ENY
        </h1>
        <ThemeToggle />
      </header>

      <main className="container mx-auto max-w-4xl w-full space-y-6">
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <CalendarDays className="h-6 w-6" />
              Bet Dates (Your Selection)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DatePickerWithRange
              selectedDates={selectedDates}
              onDatesChange={setSelectedDates}
              className="w-full md:w-auto"
            />
             {selectedDates?.from && (
              <p className="text-sm text-muted-foreground mt-2">
                Selected: {format(selectedDates.from, "PPP")}
                {selectedDates.to && selectedDates.to !== selectedDates.from ? ` - ${format(selectedDates.to, "PPP")}` : ""}
              </p>
            )}
          </CardContent>
        </Card>

        <TrackSelector selectedTracks={selectedTracks} onTracksChange={setSelectedTracks} />
        
        <ImageUploadForm
          setIsLoading={setIsLoading}
          onInterpretSuccess={handleInterpretSuccess}
          onInterpretError={handleInterpretError}
        />

        {isLoading && (
          <div className="flex flex-col items-center justify-center p-10 bg-card rounded-lg shadow-lg text-primary">
            <Loader2 className="h-12 w-12 animate-spin mb-4" />
            <p className="text-lg font-semibold">Interpreting your ticket...</p>
            <p className="text-sm text-muted-foreground">This may take a few moments.</p>
          </div>
        )}
        
        {error && !isLoading && (
           <Alert variant="destructive" className="shadow-lg">
             <AlertCircle className="h-5 w-5" />
             <AlertTitle>Oops! Something went wrong.</AlertTitle>
             <AlertDescription>{error}</AlertDescription>
           </Alert>
        )}

        {(aiIdentifiedDate || aiIdentifiedTrack) && !isLoading && !error && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm text-primary">
                <Info className="h-5 w-5" />
                AI Identified from Ticket
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              {aiIdentifiedDate && <p><strong>Ticket Date (from AI):</strong> {aiIdentifiedDate}</p>}
              {aiIdentifiedTrack && <p><strong>Track (from AI):</strong> {aiIdentifiedTrack}</p>}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
                <ListChecksIcon className="h-6 w-6"/>
                Plays Table
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BetTable bets={bets} onBetsChange={handleBetsChange} />
            {bets.length === 0 && !isLoading && !error && (
              <div className="text-center p-6 text-muted-foreground">
                <Ticket className="h-12 w-12 mx-auto opacity-50 mb-2" />
                <p>Upload a ticket image or add plays manually to see them here.</p>
              </div>
            )}
          </CardContent>
        </Card>
        
        <div className="flex flex-wrap justify-between items-center gap-4 mb-4 p-4 bg-card rounded-lg shadow">
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleAddPlay} variant="default">
              Add Play
            </Button>
            <Button variant="outline" disabled>Wizard</Button> 
            <Button onClick={handleRemoveLastPlay} variant="destructive" disabled={bets.length === 0}>
              Remove Last Play
            </Button>
            <Button onClick={handleResetForm} variant="outline">
             Reset Form
            </Button>
          </div>
          <div className="text-lg font-semibold text-primary">
            Total Plays: <span className="text-accent">${overallTotal.toFixed(2)}</span>
          </div>
        </div>
        
        <Button size="lg" className="w-full bg-green-600 hover:bg-green-700 text-white" disabled>
          <Ticket className="mr-2 h-5 w-5" /> Generate Ticket
        </Button>


      </main>
      <footer className="w-full text-center py-8 mt-12 border-t border-border">
        <p className="text-sm text-muted-foreground">
          Beast Reader &copy; {new Date().getFullYear()} - Powered by AI
        </p>
      </footer>
    </div>
  );
}
