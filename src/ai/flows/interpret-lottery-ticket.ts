
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
  comboAmount: z.number().nullable().describe('The amount wagered on a combo bet for this number. THIS FIELD MUST BE NULL unless "combo", "com", or a similar explicit abbreviation for combo is clearly present for this specific bet number on the ticket. Do NOT infer a combo bet or copy amounts from straight/box if "combo" is not explicitly written.'),
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

Key Instructions for 'comboAmount':
- The 'comboAmount' field MUST BE NULL if the ticket does NOT explicitly state "combo", "com", or a similar direct abbreviation for a combo bet for that specific bet number.
- Do NOT assume a combo bet. Do NOT copy amounts from 'straightAmount' or 'boxAmount' into 'comboAmount' unless there is a clear, separate "combo" wager indicated.
- If a bet number has only straight and/or box wagers, 'comboAmount' must be null.

For each distinct bet number, identify the amounts wagered for "straight" (str), "box" (box), and "combo" (com, combo) types.
Try to determine the 'gameMode' (e.g., Pick 3, Win 4, Pale based on number format or explicit markings). If not clear, this can be omitted.
Ensure all monetary amounts are numbers. If a wager type is not present for a number, use null for its amount.

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
    
    const processedBets = output?.bets.map(bet => {
      // Ensure amounts are numbers or null, default to null if undefined or not a number.
      // The prompt now heavily emphasizes that comboAmount should be null if not explicitly stated by the model.
      // We trust the model's output for comboAmount based on the reinforced prompt.
      // If the model does not return a number for comboAmount, it will be treated as null.
      const straight = typeof bet.straightAmount === 'number' ? bet.straightAmount : null;
      const box = typeof bet.boxAmount === 'number' ? bet.boxAmount : null;
      let combo = typeof bet.comboAmount === 'number' ? bet.comboAmount : null;

      // Additional check: If the model *still* somehow copies straight or box to combo
      // AND combo was not a distinct value, this is a heuristic.
      // However, the primary reliance is on the prompt for the model to *not* provide comboAmount if not explicit.
      // This check is less reliable as the model might legitimately identify a combo that's the same as straight/box.
      // The prompt is the main enforcer.
      // For example, if ticket says "123 $1 str, $1 box, $1 com", combo:1 is correct.
      // If ticket says "123 $1 str, $1 box", model *should* return combo:null.

      return {
        betNumber: typeof bet.betNumber === 'string' ? bet.betNumber : String(bet.betNumber || ""),
        gameMode: typeof bet.gameMode === 'string' ? bet.gameMode : undefined,
        straightAmount: straight,
        boxAmount: box,
        comboAmount: combo, // Trusting the model's output based on the strict prompt instructions.
      };
    }) || [];
    
    // Consolidate bets if the model still splits them (defensive programming)
    const consolidatedBets: z.infer<typeof BetSchema>[] = [];
    const betMap = new Map<string, z.infer<typeof BetSchema>>();

    processedBets.forEach(bet => {
      if (betMap.has(bet.betNumber)) {
        const existingBet = betMap.get(bet.betNumber)!;
        existingBet.straightAmount = existingBet.straightAmount ?? bet.straightAmount;
        existingBet.boxAmount = existingBet.boxAmount ?? bet.boxAmount;
        // For comboAmount, if the new bet has a comboAmount and the existing one doesn't, take the new one.
        // This assumes the model is correctly identifying explicit combo bets.
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
