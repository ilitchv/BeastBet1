
"use client";

import { useState, useMemo, useEffect } from 'react';
import { DateRange } from "react-day-picker";
import { addDays, format } from "date-fns";
import { ImageUploadForm } from '@/components/lotto-look/ImageUploadForm';
import { BetTable } from '@/components/lotto-look/BetTable';
import { DatePickerWithRange } from '@/components/lotto-look/DatePickerWithRange';
import { TrackSelector, type Track } from '@/components/lotto-look/TrackSelector';
import { ThemeToggle } from '@/components/lotto-look/ThemeToggle';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Ticket, AlertCircle, DollarSign, CalendarDays, ListChecksIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { InterpretLotteryTicketOutput as AIOutputType } from '@/ai/flows/interpret-lottery-ticket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Bet = AIOutputType['bets'][0];

export default function LottoLookPage() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const [selectedDates, setSelectedDates] = useState<DateRange | undefined>(undefined);
  const [selectedTracks, setSelectedTracks] = useState<Track[]>([]);

  useEffect(() => {
    // Initialize dates on the client-side to avoid hydration mismatch
    setSelectedDates({
      from: new Date(),
      to: new Date(),
    });
  }, []); // Empty dependency array ensures this runs once on mount

  const handleInterpretSuccess = (interpretedBets: Bet[]) => {
    const processedBets = interpretedBets.map(bet => ({
      ...bet,
      betNumber: bet.betNumber || "",
      gameMode: bet.gameMode || undefined,
      straightAmount: typeof bet.straightAmount === 'number' ? bet.straightAmount : null,
      boxAmount: typeof bet.boxAmount === 'number' ? bet.boxAmount : null,
      comboAmount: typeof bet.comboAmount === 'number' ? bet.comboAmount : null,
    }));
    setBets(processedBets);
    setError(null);
    setIsLoading(false);
    toast({
      title: "Success!",
      description: "Lottery ticket interpreted. Review and edit bets.",
      className: "bg-green-500 text-white dark:bg-green-700",
    });
  };

  const handleInterpretError = (errorMessage: string) => {
    setError(errorMessage);
    setBets([]);
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
    setBets(prevBets => [...prevBets, { betNumber: "", straightAmount: null, boxAmount: null, comboAmount: null, gameMode: undefined }]);
  };

  const handleRemoveLastPlay = () => {
    setBets(prevBets => prevBets.slice(0, -1));
  };

  const handleResetForm = () => {
    setBets([]);
    // Re-initialize dates to today on reset, client-side
    setSelectedDates({ from: new Date(), to: new Date() });
    setSelectedTracks([]);
    setError(null);
    setIsLoading(false);
    toast({
      title: "Form Reset",
      description: "All fields have been cleared.",
    });
  };


  const overallTotal = useMemo(() => {
    return bets.reduce((acc, bet) => {
      const rowTotal = (bet.straightAmount || 0) + (bet.boxAmount || 0) + (bet.comboAmount || 0);
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
              Bet Dates
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
            {/* Wizard button placeholder */}
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
