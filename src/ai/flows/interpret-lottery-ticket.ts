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

// Nuevo esquema para capturar datos brutos de la IA
const AmountSchema = z.object({
  value: z.number().describe('El valor numérico del monto tal como aparece en el ticket.'),
  position: z.string().describe('Descripción de dónde aparece este monto en relación al número (ej: "izquierda", "derecha", "abajo", "separado por /").'),
  symbols: z.array(z.string()).describe('Símbolos asociados a este monto (ej: "/", "C", "---", "|¯").'),
  context: z.string().describe('Contexto adicional (ej: "columna Box", "columna Straight").')
});

const RawBetSchema = z.object({
  betNumber: z.string().describe('El número de la apuesta tal como aparece en el ticket.'),
  amounts: z.array(AmountSchema).describe('Todos los montos asociados a esta apuesta.'),
  gameMode: z.string().describe('Modo de juego detectado (Pick 3, Win 4, etc.).'),
  context: z.string().describe('Información contextual sobre esta apuesta.')
});

// Esquema final para la salida procesada
const BetSchema = z.object({
  betNumber: z.string().describe('The 2-4 digit bet number, or Palé format XX-XX.'),
  gameMode: z.string().describe('The determined game mode (e.g., Peak 3, Win 4, Pulito, Palé, SingleAction).'),
  straightAmount: z.number().nullable().describe('The straight bet amount. Null if not applicable.'),
  boxAmount: z.number().nullable().describe('The box bet amount. Null if not applicable.'),
  comboAmount: z.number().nullable().describe('The combo bet amount. Null if not applicable.'),
});

export type Bet = z.infer<typeof BetSchema>;

const InterpretLotteryTicketOutputSchema = z.array(BetSchema).describe('An array of parsed bets from the lottery ticket.');
export type InterpretLotteryTicketOutput = z.infer<typeof InterpretLotteryTicketOutputSchema>;

export async function interpretLotteryTicket(input: InterpretLotteryTicketInput): Promise<InterpretLotteryTicketOutput> {
  return interpretLotteryTicketFlow(input);
}

// Nuevo prompt simplificado para la IA
const promptText = `Eres un agente OCR especializado en extraer información de boletos de lotería manuscritos.
Tu tarea es extraer la información tal como aparece en el ticket, sin interpretar ni asignar tipos de apuesta.

INSTRUCCIONES:
1. Extrae cada número de apuesta (betNumber) tal como aparece en el ticket.
2. Para cada número de apuesta, extrae TODOS los montos asociados, sin importar su tipo.
3. Para cada monto, identifica:
   a) Su valor numérico
   b) Su posición en relación al número (izquierda, derecha, arriba, abajo, etc.)
   c) Cualquier símbolo asociado (/, C, ---, |¯, etc.)
   d) El contexto (columna donde aparece, si está separado por un símbolo, etc.)
4. Identifica el modo de juego (Pick 3, Win 4, etc.) basado en el número de dígitos y el contexto.
5. Proporciona información contextual adicional que pueda ser útil.

FORMATO DE SALIDA:
Devuelve un array de objetos con la siguiente estructura:
{
  "betNumber": "string", // Número de apuesta tal como aparece
  "amounts": [
    {
      "value": number,    // Valor numérico del monto
      "position": "string", // Posición relativa al número
      "symbols": ["string"], // Símbolos asociados
      "context": "string"  // Contexto adicional
    }
  ],
  "gameMode": "string", // Modo de juego detectado
  "context": "string"   // Información contextual adicional
}

EJEMPLOS:
- Si ves "123 $5 / .50", extrae:
  {
    "betNumber": "123",
    "amounts": [
      {"value": 5, "position": "derecha", "symbols": [], "context": "junto al número sin símbolos"},
      {"value": 0.5, "position": "derecha", "symbols": ["/"], "context": "separado por /"}
    ],
    "gameMode": "Pick 3",
    "context": "dos montos para el mismo número"
  }

- Si ves "456 $2 C", extrae:
  {
    "betNumber": "456",
    "amounts": [
      {"value": 2, "position": "derecha", "symbols": ["C"], "context": "con letra C"}
    ],
    "gameMode": "Pick 3",
    "context": "apuesta con combo"
  }

IMPORTANTE: No interpretes los tipos de apuesta. Solo extrae los datos tal como aparecen.

Procesa la siguiente imagen del ticket de lotería: {{media url=photoDataUri}}
`;

const prompt = ai.definePrompt({
  name: 'interpretLotteryTicketPrompt',
  input: {schema: InterpretLotteryTicketInputSchema},
  output: {schema: z.array(RawBetSchema)}, // Usamos el esquema de datos brutos
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
    console.log("=== INICIANDO PROCESO DE INTERPRETACIÓN DE TICKET ===");
    
    const {output} = await prompt(input);
    
    // Logging: Mostrar salida cruda de la IA
    console.log("=== SALIDA CRUDA DE LA IA ===");
    console.log(JSON.stringify(output, null, 2));
    console.log("=== FIN SALIDA CRUDA ===");
    
    if (!output || !Array.isArray(output)) {
      console.error("ERROR: La IA no devolvió un array válido. Output:", JSON.stringify(output, null, 2));
      return [];
    }
    
    // Procesamiento básico para asegurar que los tipos de datos sean correctos
    const processedOutput = output.map(bet => {
      return {
        betNumber: String(bet.betNumber || ""),
        amounts: Array.isArray(bet.amounts) ? bet.amounts.map(amount => ({
          value: typeof amount.value === 'number' ? amount.value : 0,
          position: String(amount.position || ""),
          symbols: Array.isArray(amount.symbols) ? amount.symbols.map(s => String(s || "")) : [],
          context: String(amount.context || "")
        })) : [],
        gameMode: String(bet.gameMode || "Unknown"),
        context: String(bet.context || "")
      };
    });
    
    // Logging: Mostrar datos procesados
    console.log("=== DATOS PROCESADOS ===");
    processedOutput.forEach((bet, index) => {
      console.log(`JUGADA ${index + 1}:`);
      console.log(`  Número: ${bet.betNumber}`);
      console.log(`  Modo de juego: ${bet.gameMode}`);
      console.log(`  Contexto: ${bet.context}`);
      console.log(`  Montos (${bet.amounts.length}):`);
      bet.amounts.forEach((amount, amountIndex) => {
        console.log(`    Monto ${amountIndex + 1}: ${amount.value}`);
        console.log(`      Posición: ${amount.position}`);
        console.log(`      Símbolos: [${amount.symbols.join(', ')}]`);
        console.log(`      Contexto: ${amount.context}`);
      });
    });
    console.log("=== FIN DATOS PROCESADOS ===");
    
    // Validación adicional para betNumber
    const validatedOutput = processedOutput.map(bet => {
      const betNumber = bet.betNumber;
      
      // Expresión regular para validar:
      // - Números puros (1-4 dígitos)
      // - Formato Palé (dos dígitos, separador, dos dígitos)
      const validBetNumberRegex = /^(\d{1,4}|\d{2}[-]\d{2})$/;
      
      if (!validBetNumberRegex.test(betNumber)) {
        console.log(`VALIDACIÓN ERROR: Número inválido detectado: ${betNumber}. Marcando como vacío.`);
        return {
          ...bet,
          betNumber: "" // Marcamos como vacío para que el frontend lo resalte
        };
      }
      
      return bet;
    });
    
    // Lógica de asignación de montos a campos específicos
    const assignedOutput = validatedOutput.map(bet => {
      console.log(`ASIGNANDO MONTOS PARA: ${bet.betNumber}`);
      
      // Inicializamos los campos
      let straightAmount: number | null = null;
      let boxAmount: number | null = null;
      let comboAmount: number | null = null;
      
      // Procesamos cada monto
      bet.amounts.forEach((amount, index) => {
        console.log(`  Procesando monto ${index + 1}: ${amount.value}`);
        console.log(`    Símbolos: [${amount.symbols.join(', ')}]`);
        console.log(`    Contexto: ${amount.context}`);
        console.log(`    Posición: ${amount.position}`);
        
        // Regla 1: Si tiene símbolo "/", "---", "÷", o "|¯" → boxAmount
        if (amount.symbols.some(s => ["/", "---", "÷", "|¯"].includes(s))) {
          console.log(`    → Asignado a boxAmount (símbolo de división)`);
          boxAmount = amount.value;
          return;
        }
        
        // Regla 2: Si tiene símbolo "C", "Com", o "Combo" → comboAmount
        if (amount.symbols.some(s => ["C", "Com", "Combo"].some(comboSymbol => 
            s.toLowerCase().includes(comboSymbol.toLowerCase())))) {
          console.log(`    → Asignado a comboAmount (símbolo de combo)`);
          comboAmount = amount.value;
          return;
        }
        
        // Regla 3: Si el contexto menciona "Box" → boxAmount
        if (amount.context.toLowerCase().includes("box")) {
          console.log(`    → Asignado a boxAmount (contexto de Box)`);
          boxAmount = amount.value;
          return;
        }
        
        // Regla 4: Si el contexto menciona "Straight" → straightAmount
        if (amount.context.toLowerCase().includes("straight")) {
          console.log(`    → Asignado a straightAmount (contexto de Straight)`);
          straightAmount = amount.value;
          return;
        }
        
        // Regla 5: Montos pequeños (típicamente para box)
        if (amount.value < 1 && amount.value > 0) {
          console.log(`    → Asignado a boxAmount (monto pequeño típico de box)`);
          boxAmount = amount.value;
          return;
        }
        
        // Regla 6: Por defecto → straightAmount
        console.log(`    → Asignado a straightAmount (por defecto)`);
        straightAmount = amount.value;
      });
      
      const result = {
        betNumber: bet.betNumber,
        gameMode: bet.gameMode,
        straightAmount,
        boxAmount,
        comboAmount
      };
      
      console.log(`  RESULTADO FINAL PARA ${bet.betNumber}:`);
      console.log(`    straightAmount: ${straightAmount}`);
      console.log(`    boxAmount: ${boxAmount}`);
      console.log(`    comboAmount: ${comboAmount}`);
      
      return result;
    });
    
    // Logging: Mostrar resultados asignados
    console.log("=== RESULTADOS ASIGNADOS ===");
    assignedOutput.forEach((bet, index) => {
      console.log(`JUGADA ${index + 1} (${bet.betNumber}):`);
      console.log(`  straightAmount: ${bet.straightAmount}`);
      console.log(`  boxAmount: ${bet.boxAmount}`);
      console.log(`  comboAmount: ${bet.comboAmount}`);
    });
    console.log("=== FIN RESULTADOS ASIGNADOS ===");
    
    // Consolidamos apuestas con el mismo número
    const consolidatedBetsMap = new Map<string, Bet>();
    assignedOutput.forEach(bet => {
      const key = bet.betNumber;
      if (consolidatedBetsMap.has(key)) {
        const existingBet = consolidatedBetsMap.get(key)!;
        
        // Combinamos los montos, priorizando los no nulos
        existingBet.straightAmount = existingBet.straightAmount ?? bet.straightAmount;
        existingBet.boxAmount = existingBet.boxAmount ?? bet.boxAmount;
        existingBet.comboAmount = existingBet.comboAmount ?? bet.comboAmount;
        
        // Si el gameMode existente es "Unknown" y el nuevo es más específico, lo actualizamos
        if (existingBet.gameMode === "Unknown" && bet.gameMode !== "Unknown") {
            existingBet.gameMode = bet.gameMode;
        }
        
        console.log(`CONSOLIDANDO: Combinando datos para ${key}`);
      } else {
        consolidatedBetsMap.set(key, { ...bet });
      }
    });
    
    const consolidated = Array.from(consolidatedBetsMap.values());
    
    // Logging: Mostrar resultado final
    console.log("=== RESULTADO FINAL CONSOLIDADO ===");
    console.log(JSON.stringify(consolidated, null, 2));
    console.log("=== FIN RESULTADO FINAL ===");
    console.log("=== FIN PROCESO DE INTERPRETACIÓN DE TICKET ===");
    
    return consolidated;
  }
);
