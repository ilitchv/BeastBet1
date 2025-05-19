
"use client";

import type { ChangeEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ListChecks, Edit2 } from 'lucide-react';
import type { InterpretLotteryTicketOutput } from '@/ai/flows/interpret-lottery-ticket';

// This type will be derived from the AI flow's output schema
type Bet = InterpretLotteryTicketOutput['bets'][0];

interface BetTableProps {
  bets: Bet[];
  onBetsChange: (updatedBets: Bet[]) => void;
}

export function BetTable({ bets, onBetsChange }: BetTableProps) {
  
  const handleBetNumberChange = (index: number, value: string) => {
    const updatedBets = bets.map((bet, i) => 
      i === index ? { ...bet, betNumber: value } : bet
    );
    onBetsChange(updatedBets);
  };

  const handleGameModeChange = (index: number, value: string) => {
    const updatedBets = bets.map((bet, i) =>
      i === index ? { ...bet, gameMode: value } : bet
    );
    onBetsChange(updatedBets);
  };

  const handleAmountChange = (index: number, field: 'straightAmount' | 'boxAmount' | 'comboAmount', value: string) => {
    const updatedBets = bets.map((bet, i) => {
      if (i === index) {
        const numericValue = parseFloat(value);
        return { ...bet, [field]: isNaN(numericValue) ? null : numericValue };
      }
      return bet;
    });
    onBetsChange(updatedBets);
  };

  const calculateTotal = (bet: Bet) => {
    return (bet.straightAmount || 0) + (bet.boxAmount || 0) + (bet.comboAmount || 0);
  };

  if (bets.length === 0) {
    return null; 
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-primary">
          <ListChecks className="h-6 w-6" />
          Interpreted Bets
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">#</TableHead>
                <TableHead className="min-w-[120px]">Bet Number</TableHead>
                <TableHead className="min-w-[100px]">Game Mode</TableHead>
                <TableHead className="min-w-[100px] text-right">Straight ($)</TableHead>
                <TableHead className="min-w-[100px] text-right">Box ($)</TableHead>
                <TableHead className="min-w-[100px] text-right">Combo ($)</TableHead>
                <TableHead className="min-w-[100px] text-right">Total ($)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bets.map((bet, index) => (
                <TableRow key={index}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>
                    <Input
                      value={bet.betNumber}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => handleBetNumberChange(index, e.target.value)}
                      aria-label={`Bet number for row ${index + 1}`}
                      className="text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={bet.gameMode || ''}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => handleGameModeChange(index, e.target.value)}
                      aria-label={`Game mode for row ${index + 1}`}
                      className="text-sm"
                      placeholder="e.g. Pick 3"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      value={bet.straightAmount === null ? '' : bet.straightAmount}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => handleAmountChange(index, 'straightAmount', e.target.value)}
                      aria-label={`Straight amount for row ${index + 1}`}
                      className="text-sm text-right"
                      placeholder="0.00"
                      step="0.01"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      value={bet.boxAmount === null ? '' : bet.boxAmount}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => handleAmountChange(index, 'boxAmount', e.target.value)}
                      aria-label={`Box amount for row ${index + 1}`}
                      className="text-sm text-right"
                      placeholder="0.00"
                      step="0.01"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      value={bet.comboAmount === null ? '' : bet.comboAmount}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => handleAmountChange(index, 'comboAmount', e.target.value)}
                      aria-label={`Combo amount for row ${index + 1}`}
                      className="text-sm text-right"
                      placeholder="0.00"
                      step="0.01"
                    />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {calculateTotal(bet).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {bets.length > 0 && (
            <p className="mt-4 text-sm text-muted-foreground flex items-center gap-1">
                <Edit2 className="h-4 w-4" /> You can edit the values directly in the table.
            </p>
        )}
      </CardContent>
    </Card>
  );
}
