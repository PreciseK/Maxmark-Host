// supabase/functions/_shared/r2.ts
//
// Presigned-URL helper for Cloudflare R2 (S3-compatible API), using
// aws4fetch — a ~6KB Deno-native SigV4 signer, no AWS SDK needed. Mirrors
// the shared-helper pattern of cors.ts / license.ts in this same directory.

import { AwsClient } from 'npm:aws4fetch@1'

function getR2Client(): AwsClient {
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials are not configured')
  }
  return new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'auto',
  })
}

function bucketEndpoint(bucket: string): string {
  const accountId = Deno.env.get('R2_ACCOUNT_ID')
  if (!accountId) {
    throw new Error('R2_ACCOUNT_ID is not configured')
  }
  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}`
}

/**
 * Presign a PUT for a browser to upload directly to R2. Content-Length is
 * signed into the URL so R2 rejects any upload that doesn't match the
 * declared size — enforcement happens at R2, not just in client JS.
 */
export async function presignPut(
  bucket: string,
  key: string,
  contentType: string,
  contentLength: number,
  expiresInSeconds: number,
): Promise<string> {
  const client = getR2Client()
  const url = new URL(`${bucketEndpoint(bucket)}/${key}`)
  url.searchParams.set('X-Amz-Expires', String(expiresInSeconds))

  const signed = await client.sign(
    new Request(url, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(contentLength),
      },
    }),
    { aws: { signQuery: true } },
  )

  return signed.url
}

/** Presign a GET for a browser to download directly from R2. */
export async function presignGet(
  bucket: string,
  key: string,
  expiresInSeconds: number,
): Promise<string> {
  const client = getR2Client()
  const url = new URL(`${bucketEndpoint(bucket)}/${key}`)
  url.searchParams.set('X-Amz-Expires', String(expiresInSeconds))

  const signed = await client.sign(new Request(url, { method: 'GET' }), {
    aws: { signQuery: true },
  })

  return signed.url
}
