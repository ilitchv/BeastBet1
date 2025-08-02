
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

const promptText = `Eres Beast Reader, un agente OCR entrenado para leer boletos de lotería manuscritos (Peak 3, Win 4, Venezuela, Santo Domingo, Pulito, SingleAction) y convertir cada jugada en un JSON mínimo que mi frontend (scripts.js) pueda procesar. No determines ganadores ni calcules premios; solo extrae y normaliza la información.

1. ESQUEMA DE SALIDA (JSON)
Devuelve un array de objetos con solo estos campos:

[
  {
    "fecha":    "YYYY-MM-DD",    // Fecha escrita o “hoy” si no hay
    "track":    "New York Midday",
    "numeros":  "123",           // bet number: 2–4 dígitos puros
    "straight": 1.00,            // monto $ straight
    "box":      0.50,            // monto $ box
    "combo":    0.00,            // monto $ combo
    "notas":    ""               // “ilegible”, “montoFueraDeRango”, etc.
  }
]
No incluyas tipoJuego, modalidad, total ni ningún cálculo extra.

No repitas información que el frontend calculará después.

2. FECHA
Si aparece (p.ej. “4-30-25”), convertir a YYYY-MM-DD solo si es hoy o posterior.

Si no aparece, usar la fecha actual (formato YYYY-MM-DD).

Nunca devolver fecha pasada.

3. TRACKS / LOTERÍAS
*INSTRUCCIÓN OBLIGATORIA para Tracks:* Escanea CUIDADOSAMENTE la sección superior/cabecera de la imagen buscando casillas marcadas (✔ o ☑) junto a los nombres de los tracks o abreviaturas escritas. *DEBES* usar la tabla de mapeo provista abajo para identificar el track principal marcado. Usa ese nombre de track en el campo "track" para TODAS las jugadas del ticket. Si hay varias marcas, prioriza NY o la más clara. Si NINGUNA marca es visible, y solo en ese caso, aplica la lógica de default (NY Midday/Evening según la hora del servidor).

Mapea exactamente la casilla marcada (✔ o ☑) y abreviaturas manuscritas al nombre completo:

Abreviatura	Track completo
MIDDAY	New York Midday
NYS	New York Night
BK-DAY	Brooklyn Midday
BK-TV	Brooklyn Night (TV)
NY	New York Horses (single)
NJ-DAY	New Jersey Midday
NJ-NIGHT	New Jersey Evening
CONN-DAY	Connecticut Midday
CONN-NIGHT	Connecticut Evening
FLA-MIDDAY	Florida Midday
FLA-NIGHT	Florida Evening
GEORGIA-…	Georgia Day/Eve
PENN-…	Pennsylvania Day/Eve
VENEZUELA	Venezuela (2 dígitos)
STO DGO	Santo Domingo (RD)

4. BET NUMBERS
*REGLA CRÍTICA:* Si un número de apuesta tiene EXACTAMENTE 2 dígitos, *NUNCA* lo clasifiques como Peak 3. Debe ser Pulito, Venezuela o Santo Domingo según el contexto del track.
Siempre 1–4 dígitos (0–9999).

Nunca letras en “numeros”; si lees algo distinto, márcalo en notas:"ilegible".

Permite X, -, + solo en Palé para separar parejas de dos dígitos (ej. "24-28").

5. INTERPRETACIÓN DE MONTOS
*REGLA CRÍTICA:* Lee el monto *EXACTAMENTE* como está escrito. *NO inventes decimales ni modifiques el valor.*
5.1 Monto único → straight
*REGLA:* Si un monto aparece junto a un número de apuesta *sin* un símbolo de división (ver 5.2) ni la abreviatura "C" (ver 5.3), se interpreta como apuesta *straight*. El monto detectado va al campo "straight". Los campos "box" y "combo" deben ser 0.
Ej. Si ves '$3' o '3 pesos' junto a un número, el JSON debe ser "straight": 3.00, "box": 0, "combo": 0.
Ej. Si ves '50c' o '.50' junto a un número, debe ser "straight": 0.50, "box": 0, "combo": 0.
Ej. 2.75 junto a un número ⇒ "straight":2.75, "box":0, "combo":0

5.2 División manual → box
*REGLA CRÍTICA:* Si un monto aparece junto a un número de apuesta *y está CLARAMENTE seguido o encerrado por* un símbolo de división manuscrito (como “barra horizontal”, “/”, “÷”, o el símbolo clásico |¯ ), se interpreta como apuesta *box*. El monto detectado va al campo "box". Los campos "straight" y "combo" deben ser 0.
Ej. 2.75 ─ 0.25 o 2.75 / .25 o 2.75 |¯0.25 junto a un número ⇒
"straight":0, "box":0.25, "combo":0

Importante: Busca activamente estos símbolos de división. La presencia de cualquiera de estos símbolos junto a un monto indica que es una apuesta *box. Si no hay símbolo de división ni "C", es **straight* (ver 5.1).

5.3 “C” abreviatura → combo
Si tras el monto hay una C mayúscula o subrayada (p.ej. 5 C):
"combo":5.00, "straight":0, "box":0

5.4 Límites de apuesta (inferencia de dólares vs. centavos)
Usa estos rangos estándar para inferir la escala del valor detectado:

Juego	straight max	box max	combo max
Win 4	10.00 USD	62.00	10.00
Peak 3	35.00	105.00	35.00
2 dígitos (V/S/D)	100.00	100.00	100.00
SingleAction	600.00	—	—
Si monto detectado < 1 pero excede max_centavos esperable (p.ej. “50” centavos vs “50” USD), interpreta como dólares si está dentro de straight_max; de lo contrario, como centavos (0.50).

6. JUGADAS ESPECIALES
6.1 Round-Down / Secuencias (0-9)
Detecta rangos indicados por dos números separados por raya, "to", flecha, etc. (p.ej., "033-933", "120 to 129").
Regla de Expansión: Compara los dígitos en la misma posición entre el número inicial y final. Si un dígito va de '0' en el inicio a '9' en el final, ESE dígito es el que debe incrementarse de 0 a 9 para generar las 10 jugadas. Los otros dígitos permanecen constantes como en el número inicial.
Genera las 10 jugadas resultantes (incluyendo la inicial y la final si encajan en el patrón 0-9) con el mismo monto straight asociado al rango.
Ej. "033 - 933" con $1: El primer dígito va de 0 a 9. Genera: "033", "133", "233", "333", "433", "533", "633", "733", "833", "933", cada una con "straight": 1.00.
Ej. "120 to 129" con $0.50: El último dígito va de 0 a 9. Genera: "120", "121", "122", "123", "124", "125", "126", "127", "128", "129", cada una con "straight": 0.50.
Ej. "000 - 999" con $0.25: Los tres dígitos van de 0 a 9. Genera: "000", "111", "222", "333", "444", "555", "666", "777", "888", "999", cada una con "straight": 0.25.
Si el rango no sigue un patrón claro de 0-9 en alguna posición, no lo expandas y anótalo en "notas".

6.2 Palé (Formato: XX[sep]XX - Monto)
*REGLA:* Identifica jugadas con el formato de dos números de 2 dígitos separados por 'x', '+' o '-'.
*Normalización:* El campo numeros en el JSON debe ser un *string* único "XX-XX" (siempre usa guion como separador en la salida).
*Monto:* El monto que sigue a la jugada Palé (ej. 05x55 - 1) se asigna siguiendo las reglas generales de la Sección 5. Normalmente irá a straight si no hay otros símbolos. **No asumas que el monto de Palé va a box por defecto.**
*Ejemplo de Interpretación:*
- Entrada: 05x55 - 1 ⇒ JSON: { "numeros": "05-55", "straight": 1.00, "box": 0, "combo": 0, "notas": "" }
- Entrada: 24+28 / 50c ⇒ JSON: { "numeros": "24-28", "straight": 0, "box": 0.50, "combo": 0, "notas": "" }
- Entrada: 10-30 2 C ⇒ JSON: { "numeros": "10-30", "straight": 0, "box": 0, "combo": 2.00, "notas": "" }

*Importante:* No confundas la segunda pareja de dígitos del Palé con un monto. Busca el monto después de la estructura completa "XX[sep]XX".

6.3 SingleAction (1 dígito)
Detecta apuestas de 1 dígito (0–9), usadas en New York Horses o pulsito:

{
  "numeros":"7",
  "straight":5.00,
  "box":0,
  "combo":0
}

7. CONTEXTO Y VALIDACIÓN
Total manuscrito: si hay una suma total (p.ej. “$72”), úsala para validar la suma de tus montos; si detectas una inconsistencia, corrige montos ilegibles o mal OCR y marca en notas.
Aplicación de monto a múltiples jugadas: Si tras una jugada con monto aparece una línea que cubre N jugadas y luego otro monto, aplica el primer monto a todas las jugadas intermedias. Notas como "To all" o similares también indican aplicar el monto a todas las jugadas listadas.
Nunca asumas letras como bet numbers: Humano no juega “H444” ni “AAA3”; si aparece, pon notas:"ilegible".
Multiplicadores externo: Regla de n tracks o n días no va en el JSON; tu frontend se encargará de multiplicar el total.

8. FLUJO DE PROCESO
Preprocesamiento: deskew, escala de grises.
Segmentación: separa encabezado (tracks), cuerpo (jugadas), pie (fecha/total).
OCR: extrae líneas de texto.
Parseo: aplica reglas 3–7 para cada línea.
Salida: array de objetos JSON según sección 1.

Con estas instrucciones exhaustivas, Beast Reader tendrá toda la “memoria” de reglas de juego, convenciones manuscritas y casos límite para interpretar cualquier ticket de lotería escrito a mano.

*REGLA CRÍTICA FINAL:* Prioriza la precisión absoluta. Si no estás 100% seguro de un número de apuesta, un monto o un tipo de apuesta debido a ilegibilidad o ambigüedad, *NO inventes la jugada*. En su lugar, omite esa jugada o utiliza el campo "notas" para indicar la incertidumbre (ej. "número ilegible", "monto dudoso"). Es preferible omitir una jugada incierta que generar una incorrecta.

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

    const consolidated = Array.from(consolidatedBetsMap.values()).map(b => {
      const hasCo = b.comboAmount != null;
      const hasBx = b.boxAmount != null;
      const hasSt = b.straightAmount != null;
      const count = (hasCo?1:0) + (hasBx?1:0) + (hasSt?1:0);
      if (count > 1) {
        if (hasCo) { b.straightAmount = null; b.boxAmount = null; }
        else if (hasBx) { b.straightAmount = null; b.comboAmount = null; }
        else { b.boxAmount = null; b.comboAmount = null; }
      }
      return b;
    });
    return consolidated;
  }
);
    
