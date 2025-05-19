
'use server';

/**
 * @fileOverview Interprets a handwritten lottery ticket image to extract bet numbers, amounts, and bet types.
 *
 * - interpretLotteryTicket - A function that handles the lottery ticket interpretation process.
 * - InterpretLotteryTicketInput - The input type for the interpretLotteryTicket function.
 * - InterpretLotteryTicketOutput - The return type for the interpretLotteryTicket function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const InterpretLotteryTicketInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of a handwritten lottery ticket, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type InterpretLotteryTicketInput = z.infer<typeof InterpretLotteryTicketInputSchema>;

const BetSchema = z.object({
  betNumber: z.string().describe('The lottery bet number (e.g., "123", "4567", "12-34" for Pale).'),
  gameMode: z.string().optional().describe('The game mode, e.g., Pick 3, Win 4, Pale, Single Action. This might be derived from the bet number or context.'),
  straightAmount: z.number().nullable().describe('The amount wagered on a straight bet for this number. Use null if not applicable or not present.'),
  boxAmount: z.number().nullable().describe('The amount wagered on a box bet for this number. Use null if not applicable or not present.'),
  comboAmount: z.number().nullable().describe('The amount wagered on a combo bet for this number. ONLY populate this if "combo", "com", or a similar explicit abbreviation for combo is present for this bet number. Otherwise, use null.'),
});

const InterpretLotteryTicketOutputSchema = z.object({
  bets: z.array(BetSchema).describe('An array of interpreted bets from the lottery ticket. Each unique bet number should be a single entry. If a bet number has multiple wager types (e.g., $1 straight and $1 box for "123"), these should be part of the same bet object for "123".'),
});
export type InterpretLotteryTicketOutput = z.infer<typeof InterpretLotteryTicketOutputSchema>;

export async function interpretLotteryTicket(input: InterpretLotteryTicketInput): Promise<InterpretLotteryTicketOutput> {
  return interpretLotteryTicketFlow(input);
}

const prompt = ai.definePrompt({
  name: 'interpretLotteryTicketPrompt',
  input: {schema: InterpretLotteryTicketInputSchema},
  output: {schema: InterpretLotteryTicketOutputSchema},
  prompt: `You are an AI expert at interpreting handwritten lottery tickets.
You will receive an image of a lottery ticket. Your task is to extract each unique lottery number and all its associated wagers.
Group all wagers for the SAME bet number into a SINGLE bet object. For example, if the ticket shows "123 $2 str, $1 box", the output for this bet should be ONE entry:
{ "betNumber": "123", "gameMode": "Pick 3", "straightAmount": 2, "boxAmount": 1, "comboAmount": null }

- For each distinct bet number, identify the amounts wagered for "straight" (str), "box" (box), and "combo" (com, combo) types.
- The 'comboAmount' field should ONLY be populated if the ticket explicitly states "combo", "com", or a similar abbreviation for a combo bet for that specific bet number. If no explicit combo wager is found, 'comboAmount' MUST be null. Do NOT assume a combo bet.
- Try to determine the 'gameMode' (e.g., Pick 3, Win 4, Pale based on number format or explicit markings). If not clear, this can be omitted.
- Ensure all monetary amounts are numbers. If a wager type is not present for a number, use null for its amount.

Output the information in JSON format according to the schema.

Here is the image of the lottery ticket: {{media url=photoDataUri}}
`,
  config: {
    safetySettings: [
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_ONLY_HIGH',
      },
    ],
  },
});

const interpretLotteryTicketFlow = ai.defineFlow(
  {
    name: 'interpretLotteryTicketFlow',
    inputSchema: InterpretLotteryTicketInputSchema,
    outputSchema: InterpretLotteryTicketOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    // Ensure amounts are numbers or null, default to null if undefined or not a number
    const processedBets = output?.bets.map(bet => ({
      ...bet,
      betNumber: typeof bet.betNumber === 'string' ? bet.betNumber : String(bet.betNumber || ""),
      gameMode: typeof bet.gameMode === 'string' ? bet.gameMode : undefined,
      straightAmount: typeof bet.straightAmount === 'number' ? bet.straightAmount : null,
      boxAmount: typeof bet.boxAmount === 'number' ? bet.boxAmount : null,
      comboAmount: typeof bet.comboAmount === 'number' ? bet.comboAmount : null, // Crucially, rely on the model's output for combo.
    })) || [];
    
    // Additional step: Consolidate bets if the model still splits them (defensive programming)
    const consolidatedBets: Bet[] = [];
    const betMap = new Map<string, Bet>();

    processedBets.forEach(bet => {
      if (betMap.has(bet.betNumber)) {
        const existingBet = betMap.get(bet.betNumber)!;
        existingBet.straightAmount = existingBet.straightAmount ?? bet.straightAmount;
        existingBet.boxAmount = existingBet.boxAmount ?? bet.boxAmount;
        existingBet.comboAmount = existingBet.comboAmount ?? bet.comboAmount;
        if (!existingBet.gameMode && bet.gameMode) {
          existingBet.gameMode = bet.gameMode;
        }
      } else {
        betMap.set(bet.betNumber, { ...bet });
      }
    });

    consolidatedBets.push(...betMap.values());
    
    return { bets: consolidatedBets };
  }
);
