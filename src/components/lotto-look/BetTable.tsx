"use client";

import type { ChangeEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ListChecks, Edit2 } from 'lucide-react';
import type { InterpretLotteryTicketOutput } from '@/ai/flows/interpret-lottery-ticket';

type Bet = InterpretLotteryTicketOutput['bets'][0];

interface BetTableProps {
  bets: Bet[];
  onBetsChange: (updatedBets: Bet[]) => void;
}

export function BetTable({ bets, onBetsChange }: BetTableProps) {
  const handleInputChange = (index: number, field: keyof Bet, value: string | number | boolean) => {
    const updatedBets = bets.map((bet, i) => {
      if (i === index) {
        if (field === 'amount' && typeof value === 'string') {
          return { ...bet, [field]: parseFloat(value) || 0 };
        }
        return { ...bet, [field]: value };
      }
      return bet;
    });
    onBetsChange(updatedBets);
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
                <TableHead className="min-w-[120px]">Bet Number</TableHead>
                <TableHead className="min-w-[100px]">Amount</TableHead>
                <TableHead className="text-center min-w-[80px]">Straight</TableHead>
                <TableHead className="text-center min-w-[80px]">Box</TableHead>
                <TableHead className="text-center min-w-[80px]">Combo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bets.map((bet, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Input
                      value={bet.betNumber}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange(index, 'betNumber', e.target.value)}
                      aria-label={`Bet number for row ${index + 1}`}
                      className="text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={bet.amount}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange(index, 'amount', e.target.value)}
                      aria-label={`Amount for row ${index + 1}`}
                      className="text-sm"
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={bet.straight}
                      onCheckedChange={(checked) => handleInputChange(index, 'straight', !!checked)}
                      aria-label={`Straight bet for row ${index + 1}`}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={bet.box}
                      onCheckedChange={(checked) => handleInputChange(index, 'box', !!checked)}
                      aria-label={`Box bet for row ${index + 1}`}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={bet.combo}
                      onCheckedChange={(checked) => handleInputChange(index, 'combo', !!checked)}
                      aria-label={`Combo bet for row ${index + 1}`}
                    />
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
