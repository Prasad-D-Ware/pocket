// GBNF (GGML BNF) grammar for the intent parser. llama.cpp's sampler
// enforces the grammar at every token-decode step — any token that
// would break the grammar is masked to -inf logits and never sampled.
// This makes "model outputs malformed JSON" structurally impossible.
//
// Three top-level alternatives, with each kind's required fields
// fused into its branch (rather than a single shape with optional
// fields) so the model can't pair `kind: "token_transfer"` with
// `host: ...`. Wrong-pairing was the #1 failure mode for free-form
// generation; this grammar eliminates it.

export const INTENT_GRAMMAR = `
root ::= ws ( token-transfer | x402-payment | refuse ) ws

token-transfer ::= "{" ws
    "\\"kind\\"" ws ":" ws "\\"token_transfer\\"" ws "," ws
    "\\"amount_usd\\"" ws ":" ws number ws "," ws
    "\\"recipient\\"" ws ":" ws string ws
  "}"

x402-payment ::= "{" ws
    "\\"kind\\"" ws ":" ws "\\"x402_payment\\"" ws "," ws
    "\\"amount_usd\\"" ws ":" ws number ws "," ws
    "\\"host\\"" ws ":" ws string ws
  "}"

refuse ::= "{" ws
    "\\"kind\\"" ws ":" ws "\\"refuse\\"" ws "," ws
    "\\"reason\\"" ws ":" ws string ws
  "}"

string ::= "\\"" chars "\\""
chars ::= [a-zA-Z0-9 .,!?_:/-]+
number ::= [0-9]+ ( "." [0-9]+ )?
ws ::= [ \\t\\n]*
`

// Reference constants used by parser.ts to expand the model's
// abbreviated output into the full Intent shape PolicyGuard expects.
export const USDC_MINT_BASE58 = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
export const USDC_DECIMALS = 6
export const TOKEN_PROGRAM_ID =
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
export const PAY_SH_PROGRAM_ID =
  'PaySh1111111111111111111111111111111111111'
