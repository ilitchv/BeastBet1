
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

// Schema for a single parsed bet, matching previous structure
const BetSchema = z.object({
  betNumber: z.string().describe('The 2-4 digit bet number, or Palé format XX-XX.'),
  gameMode: z.string().describe('The determined game mode (e.g., Peak 3, Win 4, Pulito, Palé, SingleAction).'),
  straightAmount: z.number().nullable().describe('The straight bet amount. Null if not applicable.'),
  boxAmount: z.number().nullable().describe('The box bet amount. Null if not applicable.'),
  comboAmount: z.number().nullable().describe('The combo bet amount. Null if not applicable, or if not explicitly indicated by "C" or "Com" on the ticket.'),
});
export type Bet = z.infer<typeof BetSchema>;


const InterpretLotteryTicketOutputSchema = z.array(BetSchema).describe('An array of parsed bets from the lottery ticket.');
export type InterpretLotteryTicketOutput = z.infer<typeof InterpretLotteryTicketOutputSchema>;


export async function interpretLotteryTicket(input: InterpretLotteryTicketInput): Promise<InterpretLotteryTicketOutput> {
  return interpretLotteryTicketFlow(input);
}

const promptText = `Eres Beast Reader, un agente OCR altamente especializado en leer e interpretar boletos de lotería manuscritos para juegos como Peak 3, Win 4, y variantes como Pulito, Palé, Venezuela, Santo Domingo, y SingleAction.
Tu tarea es extraer CADA jugada individual del boleto y convertirla en un objeto JSON con los siguientes campos: "betNumber", "gameMode", "straightAmount", "boxAmount", "comboAmount".

REGLAS CLAVE PARA LA INTERPRETACIÓN:

1.  **Formato de Salida JSON (por jugada):**
    {
      "betNumber": "string", // Número de la apuesta (2-4 dígitos, o formato Palé XX-XX)
      "gameMode": "string",  // Modo de juego (Peak 3, Win 4, Pulito, Palé, SingleAction, Venezuela, Santo Domingo)
      "straightAmount": number | null, // Monto de la apuesta directa (straight). Null si no aplica.
      "boxAmount": number | null,      // Monto de la apuesta en caja (box). Null si no aplica.
      "comboAmount": number | null     // Monto de la apuesta combinada (combo). Null si no aplica.
    }
    Devuelve un ARRAY de estos objetos JSON.

2.  **Identificación de "betNumber":**
    *   Extrae números de 2 a 4 dígitos.
    *   Para Palé, el formato es "XX-XX", "XX+XX", o "XXxXX". Normaliza a "XX-XX" en la salida.

3.  **Determinación de "gameMode":**
    *   **Peak 3 / Pick 3:** Usualmente números de 3 dígitos.
    *   **Win 4:** Usualmente números de 4 dígitos.
    *   **Pulito / Venezuela / Santo Domingo (2 dígitos):** Si el "betNumber" tiene EXACTAMENTE 2 dígitos, identifica el modo de juego basado en el contexto del ticket o marcas. Si no hay contexto claro, puedes usar "Pulito" como default para 2 dígitos. NUNCA clasifiques un número de 2 dígitos como "Peak 3".
    *   **Palé:** Si el "betNumber" está en formato "XX-XX" (o similar).
    *   **SingleAction:** Si se apuesta a un solo dígito (0-9).

4.  **Interpretación de Montos ("straightAmount", "boxAmount", "comboAmount"):**
    *   Lee los montos exactamente como están escritos.
    *   Si solo hay un monto junto a un número, es "straightAmount".
    *   Si un monto está claramente dividido (ej. 1 / .50 o 1 --- .50), el primer valor podría ser "straightAmount" y el segundo "boxAmount" si aplica al mismo número. O si es 2.75 / .25, el ".25" es para "boxAmount".
    *   **"comboAmount": MUY IMPORTANTE: Solo asigna un valor a "comboAmount" si ves explícitamente la letra "C", "Com", o la palabra "Combo" asociada a ESE monto para ESA jugada. Si no hay tal indicación, "comboAmount" DEBE SER \`null\` o no incluirse para esa jugada. No copies el valor de "straightAmount" o "boxAmount" a "comboAmount" a menos que esté indicado como combo.**
    *   Si un tipo de apuesta no aplica (ej. no hay apuesta "box" para un número), el valor del campo correspondiente debe ser \`null\`.

5.  **Agrupación de Jugadas:**
    *   Si una misma línea o número de apuesta tiene múltiples tipos de wager (ej. "123 $1 straight, $0.50 box"), DEBES crear un ÚNICO objeto JSON para "123" que contenga tanto "straightAmount: 1.00" como "boxAmount: 0.50". No crees objetos separados para el mismo "betNumber" si los wagers pertenecen a él.

6.  **Manejo de Ilegibilidad:**
    *   Si una parte es ilegible, intenta inferir basado en el contexto. Si es imposible, puedes omitir la jugada o usar un valor como "ILEGIBLE" en el campo apropiado si el esquema lo permite (para "betNumber" o "gameMode") o \`null\` para montos. Es preferible omitir una jugada muy dudosa que inventar datos.

7.  **Prioridad:** La precisión en la extracción de los números y sus respectivos montos para los tipos correctos (straight, box, combo) es lo más importante.




---
REGLAS ADICIONALES (OVERRIDES, APLICAR ESTRICTAMENTE)

• **Box solo con símbolo claro de división**: Interpreta *box* únicamente cuando veas símbolos inequívocos de división junto al monto: **"/"**, **"÷"**, **"|¯"** o **una barra/doble raya horizontal** (—, – , ─) **entre dos montos** (ej.: `2.00 — .50`).
  - **No** uses un guion corto `-` como indicador de box si solo separa número y monto (p.ej. `11 - 6`). En ese caso es **straight**.
• **Straight por defecto**: Si aparece **un único monto** junto al número **sin** símbolos de división ni “C/c”, clasifícalo como **straight**.
• **Combo**: Solo asigna `comboAmount` cuando el monto esté seguido de **“C”**/**“c”** (o la palabra “Combo”).
• **Múltiples tipos en la misma jugada**: Si la línea contiene **dos montos** o notaciones distintas (p.ej. `1 / .50` o `1  C .50`), puedes devolver **más de un campo** no nulo para la **misma** jugada (p.ej., `straightAmount` y `boxAmount`). **No** dupliques el mismo monto en varios campos.
• **Nunca rellenes los tres campos con el mismo monto**. Si hay duda, prioriza **straight** por defecto y añade una nota.
• **Palé guard**: El guion dentro de un Palé `XX-XX` **no** es símbolo de box. El monto de Palé sigue las reglas anteriores.
Procesa la siguiente imagen del ticket de lotería: {{media url=photoDataUri}}
`;

const prompt = ai.definePrompt({
  name: 'interpretLotteryTicketPrompt',
  input: {schema: InterpretLotteryTicketInputSchema},
  output: {schema: InterpretLotteryTicketOutputSchema},
  prompt: promptText,
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
  async (input: InterpretLotteryTicketInput): Promise<InterpretLotteryTicketOutput> => {
    const {output} = await prompt(input);

    if (!output || !Array.isArray(output)) {
      console.error("AI model did not return a valid array output. Output:", JSON.stringify(output, null, 2));
      // Return an empty array or throw an error, depending on how you want to handle this.
      return [];
    }

    // Post-processing to ensure comboAmount is null if not explicitly a combo
    const processedOutput = output.map(bet => {
      // Basic check: if comboAmount is present and identical to straightAmount,
      // and boxAmount is null or zero, it might be a misinterpretation unless "combo" was explicitly stated.
      // For now, we're relying heavily on the prompt for this.
      // A more robust solution might involve the AI also returning a flag if "combo" keyword was seen.
      return {
        betNumber: String(bet.betNumber || ""),
        gameMode: String(bet.gameMode || "Unknown"),
        straightAmount: typeof bet.straightAmount === 'number' ? bet.straightAmount : null,
        boxAmount: typeof bet.boxAmount === 'number' ? bet.boxAmount : null,
        comboAmount: typeof bet.comboAmount === 'number' ? bet.comboAmount : null, // Ensure this is handled correctly by the prompt.
      };
    });

    // Consolidate bets if the model still splits them for the same betNumber
    const consolidatedBetsMap = new Map<string, Bet>();
    processedOutput.forEach(bet => {
      const key = bet.betNumber;
      if (consolidatedBetsMap.has(key)) {
        const existingBet = consolidatedBetsMap.get(key)!;
        existingBet.straightAmount = existingBet.straightAmount ?? bet.straightAmount;
        existingBet.boxAmount = existingBet.boxAmount ?? bet.boxAmount;
        existingBet.comboAmount = existingBet.comboAmount ?? bet.comboAmount;
        // Potentially merge gameMode or take the first one if it differs, though ideally it shouldn't
        if (existingBet.gameMode === "Unknown" && bet.gameMode !== "Unknown") {
            existingBet.gameMode = bet.gameMode;
        }
      } else {
        consolidatedBetsMap.set(key, { ...bet });
      }
    });

    return Array.from(consolidatedBetsMap.values());
  }
);
    
