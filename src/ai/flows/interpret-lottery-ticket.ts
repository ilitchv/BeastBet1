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

const InterpretLotteryTicketOutputSchema = z.object({
  bets: z.array(
    z.object({
      betNumber: z.string().describe('The lottery bet number.'),
      amount: z.number().describe('The amount bet on the number.'),
      straight: z.boolean().describe('Whether the bet is a straight bet.'),
      box: z.boolean().describe('Whether the bet is a box bet.'),
      combo: z.boolean().describe('Whether the bet is a combo bet.'),
    })
  ).describe('An array of interpreted bets from the lottery ticket.'),
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

You will receive an image of a lottery ticket and your job is to extract the bet numbers, the amount bet, and the type of bet (straight, box, combo).

Output the information in JSON format.  If a field cannot be determined, use null as the value.

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
    return output!;
  }
);
