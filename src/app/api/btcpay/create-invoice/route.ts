import { NextRequest, NextResponse } from "next/server";

import { createBTCPayInvoice } from "@/lib/btcpay";

type CreateInvoicePayload = {
  amount?: unknown;
  currency?: unknown;
  metadata?: unknown;
};

function parseAmount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export async function POST(request: NextRequest) {
  let payload: CreateInvoicePayload;

  try {
    payload = (await request.json()) as CreateInvoicePayload;
  } catch (error) {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const amount = parseAmount(payload.amount);
  if (amount === null || amount <= 0) {
    return NextResponse.json({ message: "A positive amount is required" }, { status: 400 });
  }

  const normalizedAmount = Math.round(amount * 100) / 100;

  const currency = typeof payload.currency === "string" ? payload.currency : undefined;
  const metadata =
    payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)
      ? (payload.metadata as Record<string, unknown>)
      : undefined;

  try {
    const invoice = await createBTCPayInvoice({
      amount: normalizedAmount,
      currency,
      metadata: {
        source: "BeastBet",
        ...metadata,
      },
    });

    return NextResponse.json(
      {
        id: invoice.id,
        status: invoice.status,
        additionalStatus: invoice.additionalStatus,
        amount: invoice.amount,
        currency: invoice.currency,
        checkoutLink: invoice.checkoutLink,
        createdTime: invoice.createdTime,
        expirationTime: invoice.expirationTime,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("BTCPay create-invoice error", error);
    const message = error instanceof Error ? error.message : "Failed to create BTCPay invoice";
    const status = message.includes("environment variables") ? 500 : 502;
    return NextResponse.json({ message }, { status });
  }
}
