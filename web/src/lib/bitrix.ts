type BitrixResponse<T> = {
  result?: T
  error?: string
  error_description?: string
}

export function isBitrixConfigured(): boolean {
  return Boolean(process.env.BITRIX_WEBHOOK_URL)
}

function getBitrixBaseUrl(): string {
  const baseUrl = process.env.BITRIX_WEBHOOK_URL?.trim()
  if (!baseUrl) {
    throw new Error('BITRIX_WEBHOOK_URL is not configured')
  }
  return baseUrl.replace(/\/+$/, '')
}

export async function callBitrixMethod<T = unknown>(
  method: string,
  payload: Record<string, unknown>
): Promise<T> {
  const baseUrl = getBitrixBaseUrl()
  const endpoint = `${baseUrl}/${method}.json`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Bitrix HTTP ${response.status}: ${body || response.statusText}`)
  }

  const data = await response.json() as BitrixResponse<T>
  if (data.error) {
    throw new Error(`Bitrix API error: ${data.error} ${data.error_description || ''}`.trim())
  }

  return data.result as T
}
