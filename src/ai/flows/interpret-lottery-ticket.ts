
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
  straightAmount: z.number().nullable().describe('The amount wagered on a straight bet for this number. Use null if not applicable.'),
  boxAmount: z.number().nullable().describe('The amount wagered on a box bet for this number. Use null if not applicable.'),
  comboAmount: z.number().nullable().describe('The amount wagered on a combo bet for this number. Use null if not applicable.'),
});

const InterpretLotteryTicketOutputSchema = z.object({
  bets: z.array(BetSchema).describe('An array of interpreted bets from the lottery ticket. Each bet number should be a unique entry, with its associated wager amounts for straight, box, or combo.'),
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
You will receive an image of a lottery ticket. Your task is to extract each unique lottery number and its associated wagers.
For each distinct bet number, identify the amounts wagered for "straight", "box", and "combo" types.
If a bet number has multiple wagers (e.g., $1 straight and $1 box for the number "123"), list "123" once with both amounts in the corresponding fields.
Also, try to determine the 'gameMode' if discernible (e.g., Pick 3, Win 4, Pale based on number format or explicit markings). If not clear, this can be omitted.
Output the information in JSON format according to the schema. For wager types not present for a number, use null for their amounts.

Example: If the ticket shows "123 $2 str, $1 box", the output for this bet should be:
{ "betNumber": "123", "gameMode": "Pick 3", "straightAmount": 2, "boxAmount": 1, "comboAmount": null }

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
    // Ensure amounts are numbers or null, default to null if undefined
    const processedBets = output?.bets.map(bet => ({
      ...bet,
      straightAmount: typeof bet.straightAmount === 'number' ? bet.straightAmount : null,
      boxAmount: typeof bet.boxAmount === 'number' ? bet.boxAmount : null,
      comboAmount: typeof bet.comboAmount === 'number' ? bet.comboAmount : null,
    })) || [];
    return { bets: processedBets };
  }
);

