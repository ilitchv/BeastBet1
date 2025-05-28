
import {NextResponse} from 'next/server';
import type {NextRequest} from 'next/server';
import {interpretLotteryTicket, type InterpretLotteryTicketInput} from '@/ai/flows/interpret-lottery-ticket';

export async function POST(request: NextRequest) {
  console.log("API Route /api/interpret-ticket PINGED");
  try {
    const body = await request.json();
    const {photoDataUri} = body as InterpretLotteryTicketInput;

    if (!photoDataUri) {
      console.error("API Error: No photoDataUri provided");
      return NextResponse.json({message: 'No photoDataUri provided'}, {status: 400});
    }

    console.log("API: Calling interpretLotteryTicket flow...");
    const result = await interpretLotteryTicket({photoDataUri});
    console.log("API: interpretLotteryTicket flow result:", result);


    if (!result || !Array.isArray(result)) {
        console.error("API Error: Genkit flow did not return a valid array. Result:", result);
        return NextResponse.json({ message: 'AI did not return a valid array output.' }, { status: 500 });
    }
    
    return NextResponse.json(result, {status: 200});

  } catch (error: any) {
    console.error('API Error in /api/interpret-ticket:', error);
    // Intentar obtener un mensaje de error más específico si está disponible
    const errorMessage = error.message || 'Failed to interpret ticket due to an internal server error.';
    // Si el error tiene un stack, también podría ser útil (pero no para el cliente)
    // console.error(error.stack); 
    return NextResponse.json({message: errorMessage}, {status: 500});
  }
}

// Manejador OPTIONS para CORS si es necesario en algunos entornos, aunque Next.js suele manejarlo.
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*', // O un origen más específico
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
