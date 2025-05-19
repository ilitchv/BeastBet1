
"use client";

import type { ChangeEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Bet as BetType } from '@/app/page'; // Use the Bet type from page.tsx which matches ParsedBet

interface BetTableProps {
  bets: BetType[];
  onBetsChange: (updatedBets: BetType[]) => void;
}

export function BetTable({ bets, onBetsChange }: BetTableProps) {
  
  const handleBetChange = (index: number, field: keyof BetType, value: string | number | null | undefined) => {
    const updatedBets = bets.map((bet, i) => {
      if (i === index) {
        if (field === 'straight' || field === 'box' || field === 'combo') {
          // Allow empty string to represent null for numeric inputs
          const numericValue = typeof value === 'string' && value.trim() === '' ? null : (typeof value === 'string' ? parseFloat(value) : value);
          return { ...bet, [field]: isNaN(numericValue as number) || numericValue === null ? null : numericValue };
        }
        return { ...bet, [field]: value };
      }
      return bet;
    });
    onBetsChange(updatedBets);
  };

  const removeBet = (index: number) => {
    const updatedBets = bets.filter((_, i) => i !== index);
    onBetsChange(updatedBets);
  };

  const calculateTotal = (bet: BetType) => {
    return (bet.straight || 0) + (bet.box || 0) + (bet.combo || 0);
  };

  if (bets.length === 0) {
    return null; 
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">#</TableHead>
            <TableHead className="min-w-[120px]">Bet Number (Numeros)</TableHead>
            <TableHead className="min-w-[100px] text-right">Straight ($)</TableHead>
            <TableHead className="min-w-[100px] text-right">Box ($)</TableHead>
            <TableHead className="min-w-[100px] text-right">Combo ($)</TableHead>
            <TableHead className="min-w-[150px]">Notes (Notas)</TableHead>
            <TableHead className="min-w-[100px] text-right">Total ($)</TableHead>
            <TableHead className="w-[50px] text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bets.map((bet, index) => (
            <TableRow key={index}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>
                <Input
                  value={bet.numeros}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleBetChange(index, 'numeros', e.target.value)}
                  aria-label={`Bet number for row ${index + 1}`}
                  className="text-sm"
                />
              </TableCell>
              <TableCell className="text-right">
                <Input
                  type="number"
                  value={bet.straight === null ? '' : String(bet.straight)}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleBetChange(index, 'straight', e.target.value)}
                  aria-label={`Straight amount for row ${index + 1}`}
                  className="text-sm text-right"
                  placeholder="0.00"
                  step="0.01"
                />
              </TableCell>
              <TableCell className="text-right">
                <Input
                  type="number"
                  value={bet.box === null ? '' : String(bet.box)}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleBetChange(index, 'box', e.target.value)}
                  aria-label={`Box amount for row ${index + 1}`}
                  className="text-sm text-right"
                  placeholder="0.00"
                  step="0.01"
                />
              </TableCell>
              <TableCell className="text-right">
                <Input
                  type="number"
                  value={bet.combo === null ? '' : String(bet.combo)}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleBetChange(index, 'combo', e.target.value)}
                  aria-label={`Combo amount for row ${index + 1}`}
                  className="text-sm text-right"
                  placeholder="0.00"
                  step="0.01"
                />
              </TableCell>
              <TableCell>
                <Input
                  value={bet.notas || ''}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleBetChange(index, 'notas', e.target.value)}
                  aria-label={`Notes for row ${index + 1}`}
                  className="text-sm"
                  placeholder="e.g. illegible"
                />
              </TableCell>
              <TableCell className="text-right font-medium">
                {calculateTotal(bet).toFixed(2)}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" onClick={() => removeBet(index)} aria-label={`Remove bet row ${index + 1}`}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
       {bets.length > 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
                You can edit the values directly in the table. The AI will now try to provide "0.00" for amounts not present, but they can also be null.
            </p>
        )}
    </div>
  );
}
