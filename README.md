# Firebase Studio

This is a Next.js starter in Firebase Studio.

To get started, take a look at `src/app/page.tsx`.

## BTCPay integration

The application can collect crypto payments through BTCPay Server before a
ticket is finalized. Configure the following environment variables in your
deployment (e.g. `.env.local`, Vercel/Render environment, or Firebase
hosting):

- `BTCPAY_BASE_URL` – Base URL of your BTCPay Server instance (for example
  `https://pay.example.com`).
- `BTCPAY_STORE_ID` – Identifier of the BTCPay store that should receive the
  payments.
- `BTCPAY_API_KEY` – Greenfield API key with invoice permissions for the
  configured store.
- `BTCPAY_DEFAULT_CURRENCY` (optional) – ISO currency code to use when creating
  invoices. Defaults to `USD` when not provided.

All three required variables must be present for the `/api/btcpay/*` routes to
work. The API key is sent using the BTCPay `Authorization: token <API_KEY>`
header on every request.

### Payment flow

1. Generate a ticket preview as usual. The “Confirm & Print” button will remain
   disabled until payment is completed.
2. Click **Pay with Crypto**. This calls `/api/btcpay/create-invoice`, which
   forwards the amount to BTCPay Server and returns the invoice checkout URL.
3. Complete the payment in the BTCPay checkout window. The frontend polls
   `/api/btcpay/invoice-status` until BTCPay reports the invoice as
   `confirmed` (or settled), at which point “Confirm & Print” becomes active
   again.
4. Once the invoice is confirmed, use “Confirm & Print” to generate and save
   the ticket QR code.

If an invoice expires or BTCPay reports an error, the status message will turn
red and the “Pay with Crypto” button will re-enable so that a new invoice can be
created.
