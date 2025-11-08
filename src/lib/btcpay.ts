interface BTCPayConfig {
  baseUrl: string;
  storeId: string;
  apiKey: string;
  defaultCurrency: string;
}

export interface BTCPayInvoice {
  id: string;
  status: string;
  additionalStatus?: string;
  amount?: number;
  currency?: string;
  checkoutLink?: string;
  createdTime?: string;
  expirationTime?: string;
  [key: string]: unknown;
}

interface CreateInvoiceOptions {
  amount: number;
  currency?: string;
  metadata?: Record<string, unknown>;
  checkout?: Record<string, unknown>;
}

function getConfig(): BTCPayConfig {
  const baseUrl = process.env.BTCPAY_BASE_URL?.trim();
  const storeId = process.env.BTCPAY_STORE_ID?.trim();
  const apiKey = process.env.BTCPAY_API_KEY?.trim();
  const defaultCurrency = process.env.BTCPAY_DEFAULT_CURRENCY?.trim() || "USD";

  if (!baseUrl || !storeId || !apiKey) {
    throw new Error("BTCPay environment variables are not fully configured.");
  }

  return { baseUrl, storeId, apiKey, defaultCurrency };
}

function buildHeaders(apiKey: string): HeadersInit {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `token ${apiKey}`,
  };
}

function normalizeInvoice(payload: any): BTCPayInvoice {
  if (!payload || typeof payload !== "object") {
    throw new Error("Unexpected BTCPay response payload");
  }

  const numericAmount =
    typeof payload.amount === "number"
      ? payload.amount
      : typeof payload.amount === "string"
        ? Number(payload.amount)
        : undefined;

  return {
    ...payload,
    id: String(payload.id ?? ""),
    status: String(payload.status ?? ""),
    additionalStatus: payload.additionalStatus ? String(payload.additionalStatus) : undefined,
    amount: Number.isFinite(numericAmount) ? numericAmount : undefined,
    currency: payload.currency ? String(payload.currency) : undefined,
    checkoutLink: payload.checkoutLink ? String(payload.checkoutLink) : undefined,
    createdTime: payload.createdTime ? String(payload.createdTime) : undefined,
    expirationTime: payload.expirationTime ? String(payload.expirationTime) : undefined,
  };
}

async function performRequest(url: string, init: RequestInit): Promise<BTCPayInvoice> {
  const response = await fetch(url, init);

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(
      `BTCPay request failed with status ${response.status}: ${message || response.statusText}`,
    );
  }

  const payload = await response.json().catch(() => {
    throw new Error("Failed to parse BTCPay response as JSON");
  });

  return normalizeInvoice(payload);
}

export async function createBTCPayInvoice(options: CreateInvoiceOptions): Promise<BTCPayInvoice> {
  const { baseUrl, storeId, apiKey, defaultCurrency } = getConfig();

  const currency = options.currency?.trim().toUpperCase() || defaultCurrency;
  const body: Record<string, unknown> = {
    amount: options.amount,
    currency,
  };

  if (options.metadata) {
    body.metadata = options.metadata;
  }

  if (options.checkout) {
    body.checkout = options.checkout;
  }

  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/stores/${storeId}/invoices`;

  return performRequest(url, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });
}

export async function getBTCPayInvoice(invoiceId: string): Promise<BTCPayInvoice> {
  const { baseUrl, storeId, apiKey } = getConfig();

  const id = invoiceId.trim();
  if (!id) {
    throw new Error("Invoice ID is required");
  }

  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/stores/${storeId}/invoices/${encodeURIComponent(id)}`;

  return performRequest(url, {
    method: "GET",
    headers: buildHeaders(apiKey),
  });
}
