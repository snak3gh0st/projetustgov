import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getEnv } from '@/lib/env'

let client: S3Client | null = null

function getClient() {
  if (!client) {
    const env = getEnv()
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    })
  }
  return client
}

export async function presignedUploadUrl(key: string, contentType: string, expiresIn = 3600) {
  const env = getEnv()
  const cmd = new PutObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key, ContentType: contentType })
  return getSignedUrl(getClient(), cmd, { expiresIn })
}

export async function presignedDownloadUrl(key: string, expiresIn = 3600) {
  const env = getEnv()
  const cmd = new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key })
  return getSignedUrl(getClient(), cmd, { expiresIn })
}

export async function uploadBuffer(key: string, body: Buffer, contentType: string) {
  const env = getEnv()
  await getClient().send(new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  }))
}

export async function uploadStream(key: string, body: NodeJS.ReadableStream, contentType: string) {
  const env = getEnv()
  await getClient().send(new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    Body: body as unknown as ReadableStream,
    ContentType: contentType,
  }))
}

export async function deleteObjects(keys: string[]) {
  const env = getEnv()
  if (keys.length === 0) return
  await getClient().send(new DeleteObjectsCommand({
    Bucket: env.R2_BUCKET_NAME,
    Delete: { Objects: keys.map(Key => ({ Key })) },
  }))
}

export function publicUrl(key: string) {
  return `${getEnv().R2_PUBLIC_URL}/${key}`
}
