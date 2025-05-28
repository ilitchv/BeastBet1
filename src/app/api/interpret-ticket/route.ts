
import {NextResponse} from 'next/server';
import type {NextRequest} from 'next/server';
import {interpretLotteryTicket, type InterpretLotteryTicketInput} from '@/ai/flows/interpret-lottery-ticket';

export async function POST(request: NextRequest) {
  console.log("API Route /api/interpret-ticket PINGED - Method: POST");
  try {
    const body = await request.json();
    console.log("API Route: Request body received:", body);

    const {photoDataUri} = body as InterpretLotteryTicketInput;

    if (!photoDataUri) {
      console.error("API Error: No photoDataUri provided in request body.");
      return NextResponse.json({message: 'No photoDataUri provided'}, {status: 400});
    }

    console.log("API: Calling interpretLotteryTicket flow...");
    const result = await interpretLotteryTicket({photoDataUri});
    console.log("API: interpretLotteryTicket flow result:", result);


    if (!result || !Array.isArray(result)) {
        console.error("API Error: Genkit flow did not return a valid array. Result:", JSON.stringify(result, null, 2));
        return NextResponse.json({ message: 'AI did not return a valid array output.' }, { status: 500 });
    }
    
    return NextResponse.json(result, {status: 200});

  } catch (error: any) {
    console.error('API Error in /api/interpret-ticket:', error);
    const errorMessage = error.message || 'Failed to interpret ticket due to an internal server error.';
    // También loguear el stack si está disponible, para depuración del servidor
    if (error.stack) {
        console.error("Error stack:", error.stack);
    }
    return NextResponse.json({message: errorMessage, errorDetail: error.toString()}, {status: 500});
  }
}

// Manejador OPTIONS para CORS. Aunque Next.js maneja bien CORS para el mismo origen,
// esto puede ser útil para depuración o si el frontend estuviera en otro dominio.
export async function OPTIONS(request: NextRequest) {
  console.log("API Route /api/interpret-ticket PINGED - Method: OPTIONS");
  return new Response(null, {
    status: 204, // No Content
    headers: {
      'Access-Control-Allow-Origin': '*', // O un origen más específico
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
