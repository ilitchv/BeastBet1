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
    *   **VALIDACIÓN CRÍTICA:** El campo "betNumber" solo debe contener dígitos (0-9) y, en el caso de Palé, el separador "-". 
    *   **NO SE PERMITEN LETRAS** en "betNumber". Si detectas letras (ej. "HHHH" en lugar de "4444"), considera la jugada como ilegible y no la incluyas en la salida. 
    *   Si un número es ilegible, omite esa jugada en lugar de inventar un número.

3.  **Determinación de "gameMode":**
    *   **Peak 3 / Pick 3:** Usualmente números de 3 dígitos.
    *   **Win 4:** Usualmente números de 4 dígitos.
    *   **Pulito / Venezuela / Santo Domingo (2 dígitos):** Si el "betNumber" tiene EXACTAMENTE 2 dígitos, identifica el modo de juego basado en el contexto del ticket o marcas. Si no hay contexto claro, puedes usar "Pulito" como default para 2 dígitos. NUNCA clasifiques un número de 2 dígitos como "Peak 3".
    *   **Palé:** Si el "betNumber" está en formato "XX-XX" (o similar).
    *   **SingleAction:** Si se apuesta a un solo dígito (0-9).

4.  **Interpretación de Montos ("straightAmount", "boxAmount", "comboAmount") - REGLAS CRÍTICAS:**
    *   **REGLA FUNDAMENTAL: UN MISMO NÚMERO DE APUESTA PUEDE TENER MÚLTIPLES TIPOS DE WAGERS SIMULTÁNEAMENTE.** 
      Por ejemplo, el mismo número "123" puede tener tanto una apuesta straight como una apuesta box.
    *   **DETECCIÓN DE STRAIGHT:** Si un monto aparece junto a un número SIN NINGÚN SÍMBOLO ADICIONAL (sin "/", sin "C", sin símbolo de dos líneas), es "straightAmount".
      Ejemplos: "123 $1" → straightAmount: 1.00, boxAmount: null, comboAmount: null
    *   **DETECCIÓN DE BOX (MUY IMPORTANTE):** Si un monto aparece con ALGUNO DE ESTOS SÍMBOLOS, es "boxAmount":
      a) Símbolo de división: "/" o "---" o "÷" o "|¯" (ej. "123 / .50" → boxAmount: 0.50)
      b) Columna titulada "Box" (si el monto está bajo esa columna)
      c) Símbolo de dos líneas al lado del número
      d) Si el monto está claramente separado del número y asociado con un símbolo de box
      e) **IMPORTANTE:** Si ves un número con un monto pequeño (como 0.25, 0.50, 0.75) y no hay símbolo de combo, es muy probable que sea una apuesta box.
      Ejemplos: 
        - "123 / .50" → straightAmount: null, boxAmount: 0.50, comboAmount: null
        - "123 --- .25" → straightAmount: null, boxAmount: 0.25, comboAmount: null
        - Número "123" en columna "Box" con "$0.50" → straightAmount: null, boxAmount: 0.50, comboAmount: null
        - "123 .50" (con el monto escrito debajo o al lado con un espacio) → straightAmount: null, boxAmount: 0.50, comboAmount: null
    *   **COMBINACIÓN STRAIGHT Y BOX:** Si hay DOS MONTOS para el mismo número, uno sin símbolo (straight) y otro con símbolo de box:
      Ejemplo: "123 $1 / .50" → straightAmount: 1.00, boxAmount: 0.50, comboAmount: null
    *   **DETECCIÓN DE COMBO:** Si un monto tiene la letra "C", "Com", o "Combo" asociada:
      Ejemplo: "123 $1 C" → straightAmount: null, boxAmount: null, comboAmount: 1.00
    *   **IMPORTANTE:** Si un tipo de apuesta no aplica, el valor del campo correspondiente debe ser \`null\`.

5.  **Agrupación de Jugadas:**
    *   Si una misma línea o número de apuesta tiene múltiples tipos de wager (ej. "123 $1 straight, $0.50 box"), DEBES crear un ÚNICO objeto JSON para "123" que contenga tanto "straightAmount: 1.00" como "boxAmount: 0.50". 
    *   **NO SEPARES EN MÚLTIPLES OBJETOS JSON PARA EL MISMO NÚMERO.** Cada objeto JSON debe representar todos los wagers asociados a un único betNumber.

6.  **Manejo de Ilegibilidad:**
    *   Si una parte es ilegible, intenta inferir basado en el contexto. Si es imposible, omite la jugada. 
    *   **NO INVENTES DATOS.** Es preferible omitir una jugada muy dudosa que generar una incorrecta.

7.  **Prioridad:** La precisión en la extracción de los números y sus respectivos montos para los tipos correctos (straight, box, combo) es lo más importante.

8.  **Run Down (Rango de Números):**
    *   Cuando detectes una notación de rango como "022-922" o "000-999", debes expandirla a las 10 jugadas correspondientes.
    *   **Regla de Expansión:** Compara los dígitos en la misma posición entre el número inicial y final. Si un dígito en el número inicial es '0' y en el mismo posición del número final es '9', entonces ese dígito debe incrementarse de 0 a 9 para generar las 10 jugadas. Los otros dígitos permanecen constantes.
    *   **Ejemplo 1:** "022-922" → El primer dígito va de 0 a 9. Genera: 
        ["022", "122", "222", "322", "422", "522", "622", "722", "822", "922"]
    *   **Ejemplo 2:** "000-999" → Los tres dígitos van de 0 a 9. Genera:
        ["000", "111", "222", "333", "444", "555", "666", "777", "888", "999"]
    *   **Ejemplo 3:** "120-129" → El último dígito va de 0 a 9. Genera:
        ["120", "121", "122", "123", "124", "125", "126", "127", "128", "129"]
    *   **Importante:** Cada una de estas jugadas debe tener el mismo monto (straight, box, combo) que se indique en el ticket para el rango. Si el rango no sigue un patrón claro de 0-9 en alguna posición, no lo expandas y omite la jugada.

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
    
    // Debug logging para ver qué devuelve la IA
    console.log("AI Model Output:", JSON.stringify(output, null, 2));
    
    if (!output || !Array.isArray(output)) {
      console.error("AI model did not return a valid array output. Output:", JSON.stringify(output, null, 2));
      return [];
    }
    
    // Procesamiento básico para asegurar que los tipos de datos sean correctos
    const processedOutput = output.map(bet => {
      return {
        betNumber: String(bet.betNumber || ""),
        gameMode: String(bet.gameMode || "Unknown"),
        straightAmount: typeof bet.straightAmount === 'number' ? bet.straightAmount : null,
        boxAmount: typeof bet.boxAmount === 'number' ? bet.boxAmount : null,
        comboAmount: typeof bet.comboAmount === 'number' ? bet.comboAmount : null,
      };
    });
    
    // Validación adicional para betNumber - asegurarnos de que solo contiene dígitos y separadores válidos
    const validatedOutput = processedOutput.map(bet => {
      const betNumber = bet.betNumber;
      
      // Expresión regular para validar:
      // - Números puros (1-4 dígitos)
      // - Formato Palé (dos dígitos, separador, dos dígitos)
      const validBetNumberRegex = /^(\d{1,4}|\d{2}[-]\d{2})$/;
      
      // Si el betNumber no es válido, lo marcamos como vacío para que el frontend lo resalte
      if (!validBetNumberRegex.test(betNumber)) {
        console.log(`Invalid betNumber detected: ${betNumber}. Marking as empty for frontend correction.`);
        return {
          ...bet,
          betNumber: "" // Marcamos como vacío para que el frontend lo resalte
        };
      }
      
      return bet;
    });
    
    // Lógica de corrección para asegurar que las apuestas box se detecten correctamente
    const correctedOutput = validatedOutput.map(bet => {
      // Si solo hay un monto y es straightAmount, pero no hay boxAmount ni comboAmount,
      // verificamos si el betNumber contiene un símbolo de box que la IA pudo haber pasado por alto
      if (bet.straightAmount !== null && bet.boxAmount === null && bet.comboAmount === null) {
        const betNumber = bet.betNumber;
        
        // Buscamos símbolos de box en el betNumber que la IA podría haber interpretado incorrectamente
        const boxSymbols = ['/', '---', '÷', '|¯'];
        const hasBoxSymbol = boxSymbols.some(symbol => betNumber.includes(symbol));
        
        if (hasBoxSymbol) {
          console.log(`Detected box symbol in betNumber: ${betNumber}. Converting to boxAmount.`);
          return {
            ...bet,
            straightAmount: null,
            boxAmount: bet.straightAmount,
            comboAmount: null
          };
        }
        
        // Lógica adicional: si el monto es pequeño (típicamente para apuestas box) y no hay símbolo de combo,
        // es muy probable que sea una apuesta box
        if (bet.straightAmount < 1 && bet.straightAmount > 0) {
          console.log(`Detected small amount (${bet.straightAmount}) without combo symbol. Converting to boxAmount.`);
          return {
            ...bet,
            straightAmount: null,
            boxAmount: bet.straightAmount,
            comboAmount: null
          };
        }
      }
      
      return bet;
    });
    
    // Consolidamos apuestas con el mismo número, permitiendo múltiples tipos de apuesta
    const consolidatedBetsMap = new Map<string, Bet>();
    correctedOutput.forEach(bet => {
      const key = bet.betNumber;
      if (consolidatedBetsMap.has(key)) {
        const existingBet = consolidatedBetsMap.get(key)!;
        
        // Combinamos los montos de diferentes tipos de apuesta
        // Conservamos el primer valor no nulo para cada tipo
        existingBet.straightAmount = existingBet.straightAmount ?? bet.straightAmount;
        existingBet.boxAmount = existingBet.boxAmount ?? bet.boxAmount;
        existingBet.comboAmount = existingBet.comboAmount ?? bet.comboAmount;
        
        // Si el gameMode existente es "Unknown" y el nuevo es más específico, lo actualizamos
        if (existingBet.gameMode === "Unknown" && bet.gameMode !== "Unknown") {
            existingBet.gameMode = bet.gameMode;
        }
      } else {
        consolidatedBetsMap.set(key, { ...bet });
      }
    });
    
    const consolidated = Array.from(consolidatedBetsMap.values());
    
    // Debug logging para ver el resultado final
    console.log("Final consolidated output:", JSON.stringify(consolidated, null, 2));
    
    return consolidated;
  }
);
