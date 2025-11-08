import { NextRequest, NextResponse } from "next/server";

import { getBTCPayInvoice } from "@/lib/btcpay";

function normalizeStatus(status: string | undefined) {
  return status ? status.toLowerCase() : "";
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const invoiceId = url.searchParams.get("invoiceId")?.trim();

  if (!invoiceId) {
    return NextResponse.json({ message: "invoiceId query parameter is required" }, { status: 400 });
  }

  try {
    const invoice = await getBTCPayInvoice(invoiceId);
    return NextResponse.json({
      id: invoice.id,
      status: invoice.status,
      additionalStatus: invoice.additionalStatus,
      normalizedStatus: normalizeStatus(invoice.status),
      normalizedAdditionalStatus: normalizeStatus(invoice.additionalStatus),
      amount: invoice.amount,
      currency: invoice.currency,
      checkoutLink: invoice.checkoutLink,
      createdTime: invoice.createdTime,
      expirationTime: invoice.expirationTime,
    });
  } catch (error) {
    console.error("BTCPay invoice-status error", error);
    const message = error instanceof Error ? error.message : "Failed to fetch BTCPay invoice";
    const status = message.includes("environment variables") ? 500 : 502;
    return NextResponse.json({ message }, { status });
  }
}
