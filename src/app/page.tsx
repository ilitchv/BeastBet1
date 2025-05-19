"use client";

import { useState } from 'react';
import { GuidanceSection } from '@/components/lotto-look/GuidanceSection';
import { ImageUploadForm } from '@/components/lotto-look/ImageUploadForm';
import { BetTable } from '@/components/lotto-look/BetTable';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Ticket, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { InterpretLotteryTicketOutput } from '@/ai/flows/interpret-lottery-ticket';

type Bet = InterpretLotteryTicketOutput['bets'][0];

export default function LottoLookPage() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleInterpretSuccess = (interpretedBets: Bet[]) => {
    setBets(interpretedBets);
    setError(null);
    setIsLoading(false);
    toast({
      title: "Success!",
      description: "Lottery ticket interpreted. You can now review and edit the bets.",
      className: "bg-green-500 text-white dark:bg-green-700", // Example custom styling for success
    });
  };

  const handleInterpretError = (errorMessage: string) => {
    setError(errorMessage);
    setBets([]); // Clear previous bets on error
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

  return (
    <div className="min-h-screen bg-background flex flex-col items-center p-4 md:p-8 selection:bg-primary/20">
      <main className="container mx-auto max-w-3xl w-full space-y-8">
        <header className="text-center space-y-2 py-8">
          <div className="inline-flex items-center justify-center p-3 bg-primary text-primary-foreground rounded-full shadow-md mb-4">
            <Ticket className="h-10 w-10" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-primary tracking-tight">
            LottoLook
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground">
            Easily interpret your handwritten lottery tickets with AI.
          </p>
        </header>

        <GuidanceSection />

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

        {!isLoading && bets.length > 0 && (
          <BetTable bets={bets} onBetsChange={handleBetsChange} />
        )}
        
        {!isLoading && !error && bets.length === 0 && (
            <div className="text-center p-10 bg-card rounded-lg shadow-lg">
                <Ticket className="h-16 w-16 mx-auto text-muted-foreground opacity-50 mb-4" />
                <p className="text-muted-foreground">Upload a ticket image to see your bets here.</p>
            </div>
        )}
      </main>
      <footer className="w-full text-center py-8 mt-12 border-t border-border">
        <p className="text-sm text-muted-foreground">
          LottoLook &copy; {new Date().getFullYear()} - Powered by AI
        </p>
      </footer>
    </div>
  );
}
