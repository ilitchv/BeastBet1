
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

const ParsedBetSchema = z.object({
  numeros: z.string().describe('Bet number: 2–4 pure digits. For Palé, use "XX-XX" format.'),
  straight: z.number().nullable().describe('Straight bet amount. Null if not applicable (e.g., AI should output 0.00 as per prompt, but nullable for safety).'),
  box: z.number().nullable().describe('Box bet amount. Null if not applicable (e.g., AI should output 0.00, nullable for safety).'),
  combo: z.number().nullable().describe('Combo bet amount. Null if not applicable (e.g., AI should output 0.00, nullable for safety).'),
  notas: z.string().optional().describe('Notes like "ilegible", "montoFueraDeRango", etc. Empty or omitted if no notes.'),
});
export type ParsedBet = z.infer<typeof ParsedBetSchema>;

const InterpretLotteryTicketOutputSchema = z.object({
  parsedBets: z.array(ParsedBetSchema).describe('An array of parsed bets from the lottery ticket. Each unique bet number should be a single entry. If a bet number has multiple wager types (e.g., $1 straight and $1 box for "123"), these should be part of the same bet object for "123".'),
  ticketDate: z.string().optional().describe("The date identified on the ticket in YYYY-MM-DD format, or current date if not found/past. Optional if error or not found."),
  identifiedTrack: z.string().optional().describe("The primary track identified from markings on the ticket. Optional if none clearly marked or error."),
});
export type InterpretLotteryTicketOutput = z.infer<typeof InterpretLotteryTicketOutputSchema>;


export async function interpretLotteryTicket(input: InterpretLotteryTicketInput): Promise<InterpretLotteryTicketOutput> {
  return interpretLotteryTicketFlow(input);
}

const newPromptText = `Eres Beast Reader, un agente OCR entrenado para leer boletos de lotería manuscritos (Peak 3, Win 4, Venezuela, Santo Domingo, Pulito, SingleAction) y convertir cada jugada en un JSON mínimo que mi frontend (scripts.js) pueda procesar. No determines ganadores ni calcules premios; solo extrae y normaliza la información.

1. ESQUEMA DE SALIDA (JSON)
Devuelve un array de objetos (dentro de un objeto principal que también incluirá 'ticketDate' y 'identifiedTrack' si los encuentras) con solo estos campos para cada jugada:

{
  "numeros":  "123",        // bet number: 2–4 dígitos puros
  "straight": 1.00,         // monto $ straight. DEBE SER 0.00 si no aplica.
  "box":      0.50,         // monto $ box. DEBE SER 0.00 si no aplica.
  "combo":    0.00,         // monto $ combo. DEBE SER 0.00 si no aplica.
  "notas":    ""            // “ilegible”, “montoFueraDeRango”, etc. Vacío si no hay notas.
}

No incluyas tipoJuego, modalidad, total calculado por ti, ni ningún cálculo extra en el objeto de la jugada.

2. FECHA DEL TICKET (para el campo 'ticketDate' en la salida principal)
Si aparece una fecha en el ticket (p.ej. “4-30-25”), conviértela a formato YYYY-MM-DD. SOLO devuelve esta fecha si es la fecha actual o una fecha futura.
Si no aparece fecha en el ticket o la fecha que aparece es pasada, usa la fecha actual del servidor en formato YYYY-MM-DD para el campo 'ticketDate'.
Si no puedes determinar una fecha válida, omite el campo 'ticketDate' o déjalo vacío.

3. TRACKS / LOTERÍAS (para el campo 'identifiedTrack' en la salida principal)
INSTRUCCIÓN OBLIGATORIA para Tracks: Escanea CUIDADOSAMENTE la sección superior/cabecera de la imagen buscando casillas marcadas (✔ o ☑) junto a los nombres de los tracks o abreviaturas escritas. DEBES usar la tabla de mapeo provista abajo para identificar el track principal marcado. Usa ese nombre de track en el campo "identifiedTrack" de la salida principal. Si hay varias marcas, prioriza NY o la más clara. Si NINGUNA marca es visible, y solo en ese caso, aplica la lógica de default (NY Midday o NY Evening según la hora actual del servidor, por ejemplo, si es antes de las 3 PM, usa Midday, sino Evening). Si no puedes determinar un track, omite el campo 'identifiedTrack' o déjalo vacío.

Tabla de Mapeo de Tracks (Abreviatura manuscrita -> Track completo para "identifiedTrack"):
- MIDDAY -> New York Midday
- NYS / NIGHT -> New York Night (o New York Evening)
- BK-DAY -> Brooklyn Midday
- BK-TV / BK-NIGHT -> Brooklyn Night (TV)
- NY (si es el único indicador y contexto sugiere caballos) -> New York Horses (single)
- NJ-DAY -> New Jersey Midday
- NJ-NIGHT / NJ-EVE -> New Jersey Evening
- CONN-DAY -> Connecticut Midday
- CONN-NIGHT / CONN-EVE -> Connecticut Evening
- FLA-MIDDAY / FL-DAY -> Florida Midday
- FLA-NIGHT / FL-EVE -> Florida Evening
- GEORGIA-DAY / GA-DAY -> Georgia Day
- GEORGIA-EVE / GA-EVE -> Georgia Evening
- PENN-DAY / PA-DAY -> Pennsylvania Day
- PENN-EVE / PA-EVE -> Pennsylvania Evening
- VENEZUELA / VEN -> Venezuela (usualmente 2 dígitos)
- STO DGO / SD / RD -> Santo Domingo (RD)

4. BET NUMBERS (campo "numeros")
REGLA CRÍTICA: Si un número de apuesta tiene EXACTAMENTE 2 dígitos, NUNCA lo clasifiques como Peak 3. Debe ser Pulito, Venezuela o Santo Domingo según el contexto del track (que determinarás para "identifiedTrack").
Siempre 1–4 dígitos (0–9999).
Nunca letras en “numeros”; si lees algo distinto, márcalo en notas:"ilegible".
Permite X, -, + solo en Palé para separar parejas de dos dígitos (ej. "24-28"). En el JSON, normaliza siempre a "XX-XX" para Palé.

5. INTERPRETACIÓN DE MONTOS (campos "straight", "box", "combo")
REGLA CRÍTICA: Lee el monto EXACTAMENTE como está escrito. NO inventes decimales ni modifiques el valor si no es para normalizar (ej. 50c a 0.50). Los campos no aplicables DEBEN ser 0.00.

5.1 Monto único → straight
REGLA: Si un monto aparece junto a un número de apuesta sin un símbolo de división (ver 5.2) ni la abreviatura "C" (ver 5.3), se interpreta como apuesta straight. El monto detectado va al campo "straight". Los campos "box" y "combo" deben ser 0.00.
Ej. Si ves '$3' o '3 pesos' junto a un número, el JSON debe ser "straight": 3.00, "box": 0.00, "combo": 0.00.
Ej. Si ves '50c' o '.50' junto a un número, debe ser "straight": 0.50, "box": 0.00, "combo": 0.00.
Ej. 2.75 junto a un número ⇒ "straight":2.75, "box":0.00, "combo":0.00.

5.2 División manual → box
REGLA CRÍTICA: Si un monto aparece junto a un número de apuesta y está CLARAMENTE seguido o encerrado por un símbolo de división manuscrito (como “barra horizontal”, “/”, “÷”, o el símbolo clásico |¯ ), se interpreta como apuesta box. El monto detectado va al campo "box". Los campos "straight" y "combo" deben ser 0.00.
Ej. 2.75 ─ 0.25 o 2.75 / .25 o 2.75 |¯0.25 junto a un número ⇒ "straight":0.00, "box":0.25, "combo":0.00.
Importante: Busca activamente estos símbolos de división. La presencia de cualquiera de estos símbolos junto a un monto indica que es una apuesta box. Si no hay símbolo de división ni "C", es straight (ver 5.1).

5.3 “C” abreviatura → combo
Si tras el monto hay una C mayúscula o subrayada (p.ej. 5 C): "combo":5.00, "straight":0.00, "box":0.00.
EL CAMPO "combo" DEBE SER 0.00 SI NO HAY UNA "C" EXPLÍCITA O SIMILAR ABREVIATURA PARA COMBO JUNTO AL MONTO DE ESA JUGADA. NO INFIERAS COMBO. NO COPIES VALORES DE STRAIGHT O BOX A COMBO.

5.4 Límites de apuesta (inferencia de dólares vs. centavos)
Usa estos rangos estándar para inferir la escala del valor detectado si hay ambigüedad (ej. "50" puede ser 0.50 o 50.00):
- Win 4: straight max 10.00 USD, box max 62.00, combo max 10.00
- Peak 3: straight max 35.00, box max 105.00, combo max 35.00
- 2 dígitos (Pulito, Venezuela, Sto Domingo): straight max 100.00, box max 100.00, combo max 100.00
- SingleAction: straight max 600.00
Si monto detectado < 1 pero excede max_centavos esperable (p.ej. “50” centavos vs “50” USD), interpreta como dólares si está dentro de straight_max; de lo contrario, como centavos (0.50). Esta es una guía para desambiguar, la lectura directa es prioritaria.

6. JUGADAS ESPECIALES
6.1 Round-Down / Secuencias (0-9) (Expansión para "parsedBets")
Detecta rangos indicados por dos números separados por raya, "to", flecha, etc. (p.ej., "033-933", "120 to 129").
Regla de Expansión: Compara los dígitos en la misma posición entre el número inicial y final. Si un dígito va de '0' en el inicio a '9' en el final, ESE dígito es el que debe incrementarse de 0 a 9 para generar las 10 jugadas. Los otros dígitos permanecen constantes como en el número inicial.
Genera las 10 jugadas resultantes (incluyendo la inicial y la final si encajan en el patrón 0-9) con el mismo monto straight (u otro tipo si está indicado) asociado al rango.
Ej. "033 - 933" con $1: El primer dígito va de 0 a 9. Genera: "033", "133", "233", "333", "433", "533", "633", "733", "833", "933", cada una con "straight": 1.00, box:0.00, combo:0.00.
Ej. "120 to 129" con $0.50: El último dígito va de 0 a 9. Genera: "120", "121", "122", "123", "124", "125", "126", "127", "128", "129", cada una con "straight": 0.50, box:0.00, combo:0.00.
Ej. "000 - 999" con $0.25: Los tres dígitos van de 0 a 9. Genera: "000", "111", "222", "333", "444", "555", "666", "777", "888", "999", cada una con "straight": 0.25, box:0.00, combo:0.00.
Si el rango no sigue un patrón claro de 0-9 en alguna posición, no lo expandas y anótalo en "notas" para esa jugada (representando el rango como una sola jugada con la nota).

6.2 Palé (Formato: XX[sep]XX - Monto) (para el campo "numeros")
REGLA: Identifica jugadas con el formato de dos números de 2 dígitos separados por 'x', '+' o '-'.
Normalización: El campo "numeros" en el JSON debe ser un string único "XX-XX" (siempre usa guion como separador en la salida).
Monto: El monto que sigue a la jugada Palé (ej. 05x55 - 1) se asigna siguiendo las reglas generales de la Sección 5. Normalmente irá a "straight" si no hay otros símbolos. No asumas que el monto de Palé va a "box" por defecto.
Ejemplo de Interpretación:
- Entrada: 05x55 - 1 ⇒ JSON: { "numeros": "05-55", "straight": 1.00, "box": 0.00, "combo": 0.00, "notas": "" }
- Entrada: 24+28 / 50c ⇒ JSON: { "numeros": "24-28", "straight": 0.00, "box": 0.50, "combo": 0.00, "notas": "" }
- Entrada: 10-30 2 C ⇒ JSON: { "numeros": "10-30", "straight": 0.00, "box": 0.00, "combo": 2.00, "notas": "" }
Importante: No confundas la segunda pareja de dígitos del Palé con un monto. Busca el monto DESPUÉS de la estructura completa "XX[sep]XX".

6.3 SingleAction (1 dígito) (para el campo "numeros")
Detecta apuestas de 1 dígito (0–9).
Ej. { "numeros":"7", "straight":5.00, "box":0.00, "combo":0.00, "notas":"" }

7. CONTEXTO Y VALIDACIÓN (para mejorar la precisión general)
- Total manuscrito: si hay una suma total (p.ej. “$72”), úsala para validar la suma de tus montos; si detectas una inconsistencia, puedes re-evaluar montos o marcar en notas.
- Aplicación de monto a múltiples jugadas: Si tras una jugada con monto aparece una línea que cubre N jugadas y luego otro monto, aplica el primer monto a todas las jugadas intermedias. Notas como "To all" o similares también indican aplicar el monto a todas las jugadas listadas.
- Nunca asumas letras como bet numbers: Si aparece "H444" o "AAA3”, pon notas:"ilegible".
- Multiplicadores externos: Regla de N tracks o N días NO va en el JSON de la jugada; el frontend se encargará de multiplicar el total.

8. FLUJO DE PROCESO (Conceptual para ti, el modelo Gemini hace esto internamente)
- Preprocesamiento: deskew, escala de grises.
- Segmentación: separa encabezado (tracks), cuerpo (jugadas), pie (fecha/total).
- OCR: extrae líneas de texto.
- Parseo: aplica reglas 3–7 para cada línea.
- Salida: Objeto JSON principal con "parsedBets" (array de objetos JSON según sección 1), "ticketDate", y "identifiedTrack".

REGLA CRÍTICA FINAL: Prioriza la precisión absoluta. Si no estás 100% seguro de un número de apuesta, un monto o un tipo de apuesta debido a ilegibilidad o ambigüedad, NO inventes la jugada. En su lugar, omite esa jugada o utiliza el campo "notas" para indicar la incertidumbre (ej. "número ilegible", "monto dudoso"). Es preferible omitir una jugada incierta que generar una incorrecta.

Aquí está la imagen del lottery ticket: {{media url=photoDataUri}}
`;

const prompt = ai.definePrompt({
  name: 'interpretLotteryTicketPrompt',
  input: {schema: InterpretLotteryTicketInputSchema},
  output: {schema: InterpretLotteryTicketOutputSchema},
  prompt: newPromptText,
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

    if (!output) {
      // Consider throwing an error or returning a default structure if the AI fails to produce output
      console.error("AI model did not return an output.");
      return { parsedBets: [], ticketDate: undefined, identifiedTrack: undefined };
    }
    
    // Ensure parsedBets is an array, even if AI messes up
    const rawBets = Array.isArray(output.parsedBets) ? output.parsedBets : [];

    const processedBets: ParsedBet[] = rawBets.map((bet: any) => {
      // Ensure amounts are numbers or null, default to null if undefined or not a number.
      // The prompt asks for 0.00 if not applicable, so AI should return numbers.
      // Using nullable in Zod and here is for safety if AI doesn't perfectly adhere.
      const straight = typeof bet.straight === 'number' ? bet.straight : null;
      const box = typeof bet.box === 'number' ? bet.box : null;
      const combo = typeof bet.combo === 'number' ? bet.combo : null;

      return {
        numeros: typeof bet.numeros === 'string' ? bet.numeros : String(bet.numeros || ""),
        straight: straight,
        box: box,
        combo: combo,
        notas: typeof bet.notas === 'string' ? bet.notas : undefined,
      };
    });
    
    // Consolidate bets if the model still splits them for the same "numeros"
    // (though the new prompt is much more explicit about this).
    const consolidatedBetsMap = new Map<string, ParsedBet>();

    processedBets.forEach(bet => {
      if (consolidatedBetsMap.has(bet.numeros)) {
        const existingBet = consolidatedBetsMap.get(bet.numeros)!;
        // Prioritize non-null values if model happens to split wagers for the same number
        existingBet.straight = existingBet.straight ?? bet.straight;
        existingBet.box = existingBet.box ?? bet.box;
        existingBet.combo = existingBet.combo ?? bet.combo; 
        if (bet.notas && (!existingBet.notas || !existingBet.notas.includes(bet.notas))) {
            existingBet.notas = ((existingBet.notas || "") + " " + bet.notas).trim();
        }
      } else {
        consolidatedBetsMap.set(bet.numeros, { ...bet });
      }
    });
    
    return { 
        parsedBets: Array.from(consolidatedBetsMap.values()),
        ticketDate: typeof output.ticketDate === 'string' && output.ticketDate.trim() !== '' ? output.ticketDate : undefined,
        identifiedTrack: typeof output.identifiedTrack === 'string' && output.identifiedTrack.trim() !== '' ? output.identifiedTrack : undefined,
    };
  }
);
