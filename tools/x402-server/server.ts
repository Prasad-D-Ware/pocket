import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { X402PaymentHandler } from 'x402-solana/server'

import {
  DEVNET_RPC,
  FACILITATOR_URL,
  FAKE_USDC_DECIMALS,
  FAKE_USDC_MINT,
  NETWORK,
  PORT,
  QUOTE_PRICE_ATOMIC,
  TREASURY_ADDRESS,
} from './constants.ts'

const x402 = new X402PaymentHandler({
  network: NETWORK,
  treasuryAddress: TREASURY_ADDRESS,
  facilitatorUrl: FACILITATOR_URL,
  rpcUrl: DEVNET_RPC,
  defaultToken: {
    address: FAKE_USDC_MINT,
    decimals: FAKE_USDC_DECIMALS,
  },
})

const app = new Hono()

app.get('/', (c) =>
  c.json({
    name: 'pocket-x402-server',
    paid_routes: ['/api/quote'],
    network: NETWORK,
    facilitator: FACILITATOR_URL,
    treasury: TREASURY_ADDRESS,
    token: FAKE_USDC_MINT,
    quote_price_atomic: QUOTE_PRICE_ATOMIC,
  }),
)

app.get('/api/quote', async (c) => {
  // Always advertise the price first — we'll either return it as a 402
  // body or use it to verify the payment header.
  const requirements = await x402.createPaymentRequirements(
    {
      amount: QUOTE_PRICE_ATOMIC,
      asset: { address: FAKE_USDC_MINT, decimals: FAKE_USDC_DECIMALS },
      description: 'Pocket demo quote (Day 9)',
    },
    fullUrl(c.req.url, c.req.header('host')),
  )

  const paymentHeader = x402.extractPayment(c.req.raw.headers)
  if (!paymentHeader) {
    const { status, body } = x402.create402Response(
      requirements,
      fullUrl(c.req.url, c.req.header('host')),
    )
    // v2 protocol gate: the client only uses PAYMENT-SIGNATURE (v2)
    // on retry if the server advertised v2 via the PAYMENT-REQUIRED
    // header. Without this header the client falls back to v1
    // X-PAYMENT, which our server's extractPayment doesn't read.
    c.header(
      'PAYMENT-REQUIRED',
      Buffer.from(JSON.stringify(body)).toString('base64'),
    )
    return c.json(body, status)
  }

  const verify = await x402.verifyPayment(paymentHeader, requirements)
  if (!verify.isValid) {
    return c.json(
      { error: 'invalid payment', detail: verify.invalidReason ?? null },
      402,
    )
  }

  const settle = await x402.settlePayment(paymentHeader, requirements)
  if (!settle.success) {
    return c.json(
      { error: 'settlement failed', detail: settle.errorReason ?? null },
      502,
    )
  }

  return c.json({
    quote:
      "Most projects fail because they tried to do the wrong thing well, not the right thing badly.",
    served_at: new Date().toISOString(),
    payment: {
      // The facilitator returns the on-chain tx signature on success;
      // the exact field name has churned across versions — surface
      // whatever the facilitator gave us.
      facilitator_response: settle,
    },
  })
})

// PayAI facilitator advertises the resource URL back to clients, so it
// needs a fully-qualified URL. c.req.url can be relative on Node-server
// — patch it back to absolute using the Host header.
function fullUrl(reqUrl: string, host: string | undefined): string {
  if (/^https?:\/\//i.test(reqUrl)) return reqUrl
  const h = host ?? `localhost:${PORT}`
  return `http://${h}${reqUrl.startsWith('/') ? '' : '/'}${reqUrl}`
}

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`pocket-x402-server listening on http://localhost:${PORT}`)
  console.log(`  network    : ${NETWORK}`)
  console.log(`  treasury   : ${TREASURY_ADDRESS}`)
  console.log(`  token      : ${FAKE_USDC_MINT} (${FAKE_USDC_DECIMALS} dec)`)
  console.log(`  facilitator: ${FACILITATOR_URL}`)
  console.log(`  paid route : GET /api/quote @ ${QUOTE_PRICE_ATOMIC} atomic units (0.01 fake-USDC)`)
})
