
"use client";

import type { ChangeEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Bet as BetType } from '@/app/page'; // Uses the Bet type from page.tsx (reverted version)

interface BetTableProps {
  bets: BetType[];
  onBetsChange: (updatedBets: BetType[]) => void;
}

export function BetTable({ bets, onBetsChange }: BetTableProps) {
  
  const handleBetChange = (index: number, field: keyof BetType, value: string | number | null | undefined) => {
    const updatedBets = bets.map((bet, i) => {
      if (i === index) {
        if (field === 'straightAmount' || field === 'boxAmount' || field === 'comboAmount') {
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
    return (bet.straightAmount || 0) + (bet.boxAmount || 0) + (bet.comboAmount || 0);
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
            <TableHead className="min-w-[120px]">Bet Number</TableHead>
            <TableHead className="min-w-[100px]">Game Mode</TableHead>
            <TableHead className="min-w-[100px] text-right">Straight ($)</TableHead>
            <TableHead className="min-w-[100px] text-right">Box ($)</TableHead>
            <TableHead className="min-w-[100px] text-right">Combo ($)</TableHead>
            {/* Notes column removed as it wasn't in the previous version */}
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
                  value={bet.betNumber}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleBetChange(index, 'betNumber', e.target.value)}
                  aria-label={`Bet number for row ${index + 1}`}
                  className="text-sm"
                />
              </TableCell>
              <TableCell>
                <Input
                  value={bet.gameMode}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleBetChange(index, 'gameMode', e.target.value)}
                  aria-label={`Game mode for row ${index + 1}`}
                  className="text-sm"
                />
              </TableCell>
              <TableCell className="text-right">
                <Input
                  type="number"
                  value={bet.straightAmount === null ? '' : String(bet.straightAmount)}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleBetChange(index, 'straightAmount', e.target.value)}
                  aria-label={`Straight amount for row ${index + 1}`}
                  className="text-sm text-right"
                  placeholder="0.00"
                  step="0.01"
                />
              </TableCell>
              <TableCell className="text-right">
                <Input
                  type="number"
                  value={bet.boxAmount === null ? '' : String(bet.boxAmount)}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleBetChange(index, 'boxAmount', e.target.value)}
                  aria-label={`Box amount for row ${index + 1}`}
                  className="text-sm text-right"
                  placeholder="0.00"
                  step="0.01"
                />
              </TableCell>
              <TableCell className="text-right">
                <Input
                  type="number"
                  value={bet.comboAmount === null ? '' : String(bet.comboAmount)}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleBetChange(index, 'comboAmount', e.target.value)}
                  aria-label={`Combo amount for row ${index + 1}`}
                  className="text-sm text-right"
                  placeholder="0.00"
                  step="0.01"
                />
              </TableCell>
              {/* Notes cell removed */}
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
                You can edit the values directly in the table.
            </p>
        )}
    </div>
  );
}
    