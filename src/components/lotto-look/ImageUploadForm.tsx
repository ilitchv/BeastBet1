"use client";

import type { ChangeEvent, FormEvent } from 'react';
import { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { UploadCloud, ScanLine, Loader2, AlertCircle } from 'lucide-react';
import { interpretLotteryTicket, type InterpretLotteryTicketOutput } from '@/ai/flows/interpret-lottery-ticket';

type Bet = InterpretLotteryTicketOutput['bets'][0];

interface ImageUploadFormProps {
  setIsLoading: (loading: boolean) => void;
  onInterpretSuccess: (bets: Bet[]) => void;
  onInterpretError: (error: string) => void;
}

export function ImageUploadForm({ setIsLoading, onInterpretSuccess, onInterpretError }: ImageUploadFormProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setLocalError(null);
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setSelectedFile(null);
      setPreviewUrl(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile) {
      setLocalError('Please select an image file.');
      return;
    }

    setLocalLoading(true);
    setIsLoading(true);
    setLocalError(null);

    const reader = new FileReader();
    reader.readAsDataURL(selectedFile);
    reader.onloadend = async () => {
      const base64data = reader.result as string;
      try {
        const result = await interpretLotteryTicket({ photoDataUri: base64data });
        onInterpretSuccess(result.bets);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to interpret ticket due to an unknown error.';
        onInterpretError(errorMessage);
        setLocalError(errorMessage);
      } finally {
        setLocalLoading(false);
        setIsLoading(false);
      }
    };
    reader.onerror = () => {
      const errorMessage = 'Failed to read the image file.';
      onInterpretError(errorMessage);
      setLocalError(errorMessage);
      setLocalLoading(false);
      setIsLoading(false);
    };
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-primary">
          <UploadCloud className="h-6 w-6" />
          Upload Lottery Ticket
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Input 
            type="file" 
            accept="image/*" 
            onChange={handleFileChange} 
            className="file:text-primary file:font-semibold hover:file:bg-primary/10"
            aria-label="Lottery ticket image upload"
          />
          {previewUrl && (
            <div className="mt-4 border rounded-md p-2 inline-block bg-muted/30">
              <Image 
                src={previewUrl} 
                alt="Ticket preview" 
                width={200} 
                height={200} 
                className="rounded object-contain max-h-[200px] w-auto" 
                data-ai-hint="lottery ticket"
              />
            </div>
          )}
          <Button type="submit" disabled={localLoading || !selectedFile} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground">
            {localLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <ScanLine className="h-5 w-5 mr-2" />}
            Interpret Ticket
          </Button>
          {localError && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{localError}</AlertDescription>
            </Alert>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
