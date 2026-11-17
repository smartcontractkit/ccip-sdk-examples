/**
 * Wallet Gateway (CIP-103) client — example-owned integration code.
 *
 * `@chainlink/ccip-sdk` is wallet-agnostic by design (same as its EVM/Solana
 * CCT support: callers supply their own signer). This module is one way to
 * actually sign + submit what `CantonTokenManager` builds — talking to a
 * self-hosted or wallet-provided Wallet Gateway over its CIP-103 JSON-RPC
 * dApp API. It is NOT part of the SDK; a different integrator might instead
 * sign with a raw participant key, a different wallet's SDK, or their own
 * custody service.
 */
import type { UnsignedCantonTx } from '@chainlink/ccip-sdk'

/** Result of {@link submitViaGateway}: the gateway's `prepareExecute` response. */
export interface GatewaySubmitResult {
  /** Gateway `/approve/` URL (user-JWT auth) — open it to approve + execute. */
  approveUrl: string
  /** Raw JSON-RPC result object. */
  response: Record<string, unknown>
}

/** Inputs to {@link submitViaGateway}. */
export interface SubmitViaGatewayParams {
  /** Wallet Gateway dApp RPC URL, e.g. `http://localhost:8400/api/v0/dapp`. */
  gatewayUrl: string
  /** Gateway credential — session token or API key (not the raw Okta JWT). */
  accessToken: string
  /** The unsigned Canton tx from a CCT `generateUnsigned<Op>` call. */
  unsigned: UnsignedCantonTx
  readAs?: string[]
  synchronizerId?: string
  packageIdSelectionPreference?: string[]
  fetchFn?: typeof fetch
  signal?: AbortSignal
}

/**
 * Submit an unsigned Canton tx to a Wallet Gateway via CIP-103 `prepareExecute`.
 * Two-phase: API-key auth signs + executes immediately; user-JWT auth returns
 * an `approveUrl` for a human to approve, after which the gateway signs +
 * executes asynchronously.
 */
export async function submitViaGateway(params: SubmitViaGatewayParams): Promise<GatewaySubmitResult> {
  const {
    gatewayUrl,
    accessToken,
    unsigned,
    readAs,
    synchronizerId,
    packageIdSelectionPreference,
    fetchFn = globalThis.fetch.bind(globalThis),
    signal,
  } = params

  const requestParams: Record<string, unknown> = { ...unsigned.commands }
  if (readAs) requestParams['readAs'] = readAs
  if (synchronizerId) requestParams['synchronizerId'] = synchronizerId
  if (packageIdSelectionPreference) {
    requestParams['packageIdSelectionPreference'] = packageIdSelectionPreference
  }

  const response = await fetchFn(gatewayUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader(accessToken) },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: cryptoRandomId(),
      method: 'prepareExecute',
      params: requestParams,
    }),
    signal,
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => response.text().catch(() => ''))
    throw new GatewaySubmitError(`gateway HTTP ${response.status} ${response.statusText}`, errorBody)
  }

  const json = (await response.json()) as JsonRpcResponse
  if (json.error) {
    throw new GatewaySubmitError(
      `gateway JSON-RPC error ${json.error.code}: ${json.error.message}`,
      json.error.data,
    )
  }

  const result = (json.result ?? {}) as { userUrl?: string }
  return { approveUrl: result.userUrl ?? '', response: json.result as Record<string, unknown> }
}

/** Fetch the primary wallet's party ID from the gateway (`getPrimaryAccount`). */
export async function fetchGatewayPrimaryParty(params: {
  gatewayUrl: string
  accessToken: string
  fetchFn?: typeof fetch
  signal?: AbortSignal
}): Promise<string> {
  const { gatewayUrl, accessToken, fetchFn = globalThis.fetch.bind(globalThis), signal } = params

  const response = await fetchFn(gatewayUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader(accessToken) },
    body: JSON.stringify({ jsonrpc: '2.0', id: cryptoRandomId(), method: 'getPrimaryAccount' }),
    signal,
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    throw new GatewaySubmitError(`gateway HTTP ${response.status} ${response.statusText}`, errorBody)
  }

  const json = (await response.json()) as JsonRpcResponse
  if (json.error) {
    throw new GatewaySubmitError(
      `gateway JSON-RPC error ${json.error.code}: ${json.error.message}`,
      json.error.data,
    )
  }

  const partyId = (json.result as { partyId?: unknown } | undefined)?.partyId
  if (typeof partyId !== 'string' || !partyId) {
    throw new GatewaySubmitError('gateway getPrimaryAccount returned no partyId', json.result)
  }
  return partyId
}

/**
 * Ensure the gateway has a stored session for `accessToken`, creating one via
 * the user-API `addSession` method if none exists. A raw Bearer/Okta JWT is a
 * valid ledger credential but isn't registered as a gateway session outside
 * the browser connect flow — without this, submit/read 401s with "No session
 * found". Tolerates an already-existing session. Safe to call at every run.
 */
export async function ensureGatewaySession(params: {
  gatewayUrl: string
  accessToken: string
  networkId: string
  origin?: string
  fetchFn?: typeof fetch
  signal?: AbortSignal
}): Promise<void> {
  const {
    gatewayUrl,
    accessToken,
    networkId,
    origin = `example-${Math.random().toString(36).slice(2, 10)}`,
    fetchFn = globalThis.fetch.bind(globalThis),
    signal,
  } = params

  const userApiUrl = gatewayUrl.replace(/\/api\/v0\/dapp$/, '/api/v0/user')
  if (userApiUrl === gatewayUrl) {
    throw new GatewaySubmitError(
      `ensureGatewaySession: gatewayUrl must end with /api/v0/dapp (got ${gatewayUrl})`,
      undefined,
    )
  }

  const response = await fetchFn(userApiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader(accessToken) },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: cryptoRandomId(),
      method: 'addSession',
      params: { origin, networkId },
    }),
    signal,
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => response.text().catch(() => ''))
    // The gateway 500s with "Failed to add session" when one already exists —
    // that satisfies the precondition, so treat it as success.
    if (isDuplicateSessionError(errorBody)) return
    throw new GatewaySubmitError(
      `ensureGatewaySession: gateway HTTP ${response.status} ${response.statusText}`,
      errorBody,
    )
  }

  const json = (await response.json()) as JsonRpcResponse
  if (json.error) {
    if (isDuplicateSessionError(json)) return
    throw new GatewaySubmitError(
      `ensureGatewaySession: gateway JSON-RPC error ${json.error.code}: ${json.error.message}`,
      json.error.data,
    )
  }
}

function isDuplicateSessionError(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  const err = (body as { error?: { message?: string } }).error
  return typeof err?.message === 'string' && err.message.includes('Failed to add session')
}

/** Error thrown when a gateway submission fails (HTTP or JSON-RPC level). */
export class GatewaySubmitError extends Error {
  readonly data: unknown
  constructor(message: string, data: unknown) {
    super(message)
    this.name = 'GatewaySubmitError'
    this.data = data
  }
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

/**
 * Build the `Authorization` header from a gateway credential. Accepts a raw
 * token (sent as `Bearer <token>`) or a pre-schemed value (`ApiKey <key>` /
 * `Bearer <token>`) sent verbatim.
 */
export function authHeader(accessToken: string): string {
  if (accessToken.startsWith('ApiKey ') || accessToken.startsWith('Bearer ')) return accessToken
  return `Bearer ${accessToken}`
}

function cryptoRandomId(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined
  if (c?.randomUUID) return c.randomUUID()
  return 'cct-' + Math.random().toString(36).slice(2, 10)
}

/**
 * A `fetch` wrapper that routes Canton JSON Ledger API reads through the
 * Wallet Gateway's `ledgerApi` JSON-RPC proxy — a gateway session token
 * carries `daml_ledger_api` scope but isn't mapped to ledger-party read
 * rights on the participant, so a direct Ledger API read 464s. Requests NOT
 * targeting `ledgerBaseUrl` pass through to the real `fetch` unchanged.
 */
export function createGatewayLedgerFetch(params: {
  gatewayUrl: string
  accessToken: string
  ledgerBaseUrl: string
  signal?: AbortSignal
  fetchFn?: typeof fetch
}): typeof fetch {
  const { gatewayUrl, accessToken, ledgerBaseUrl, signal, fetchFn = globalThis.fetch.bind(globalThis) } =
    params
  const ledgerPrefix = new URL(ledgerBaseUrl).href.replace(/\/$/, '')
  let jsonRpcId = 0

  const callLedgerApi = async (
    requestMethod: 'get' | 'post' | 'patch' | 'put' | 'delete',
    resource: string,
    body?: Record<string, unknown>,
    query?: Record<string, string>,
    requestSignal?: AbortSignal,
  ): Promise<Response> => {
    const response = await fetchFn(gatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader(accessToken) },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `gw-ledger-${jsonRpcId++}`,
        method: 'ledgerApi',
        params: { requestMethod, resource, body, query: query ?? {} },
      }),
      signal: signal ?? requestSignal,
    })

    if (!response.ok) {
      return new Response(await response.text(), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const text = await response.text()
    const json = text
      ? (JSON.parse(text) as { result?: unknown; error?: { code: number; message: string; data?: unknown } })
      : {}
    if (json.error) {
      return new Response(JSON.stringify(json.error), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify(json.result ?? {}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const isRequest = typeof input !== 'string' && !(input instanceof URL) && 'method' in input
    const targetUrl = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    const method = (isRequest ? (input as Request).method : init?.method) ?? 'GET'

    if (!targetUrl.href.startsWith(ledgerPrefix)) {
      return fetchFn(input, init)
    }

    const resource = targetUrl.href.slice(ledgerPrefix.length)
    const lowerMethod = method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete'
    let body: Record<string, unknown> | undefined
    let rawBody: unknown = init?.body
    if (!rawBody && isRequest && (input as Request).body) {
      rawBody = await new Response((input as Request).body).text()
    }
    if (rawBody && lowerMethod !== 'get' && lowerMethod !== 'delete') {
      try {
        body = JSON.parse(rawBody as string) as Record<string, unknown>
      } catch {
        body = undefined
      }
    }
    const query: Record<string, string> = {}
    targetUrl.searchParams.forEach((value, key) => {
      query[key] = value
    })

    return callLedgerApi(lowerMethod, resource, body, query, init?.signal ?? undefined)
  }
}
