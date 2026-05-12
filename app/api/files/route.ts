import { NextResponse } from 'next/server'
import { minioClient, BUCKET_NAME, ensureBucket } from '@/lib/minio'

export async function GET() {
  try {
    await ensureBucket()

    // Collect all object names first (stream callbacks must stay synchronous)
    const objectNames: string[] = []
    await new Promise<void>((resolve, reject) => {
      const stream = minioClient.listObjectsV2(BUCKET_NAME, '', true)
      stream.on('data', (obj) => { if (obj.name) objectNames.push(obj.name) })
      stream.on('end', resolve)
      stream.on('error', reject)
    })

    // Fetch metadata for each object after the stream is done
    const results = await Promise.all(
      objectNames.map(async (objectName) => {
        try {
          const stat = await minioClient.statObject(BUCKET_NAME, objectName)
          const meta = stat.metaData || {}
          return {
            id: objectName,
            name: decodeURIComponent((meta['name'] as string) || objectName),
            path: decodeURIComponent((meta['path'] as string) || objectName),
            extension: (meta['extension'] as string) || '',
            size: parseInt((meta['size'] as string) || '0', 10),
            previewKind: (meta['previewkind'] as string) || 'unsupported',
            uploadedAt: parseInt((meta['uploadedat'] as string) || '0', 10),
          }
        } catch {
          return null
        }
      })
    )

    const files = results.filter(Boolean)
    files.sort((a, b) => b!.uploadedAt - a!.uploadedAt)

    return NextResponse.json(files)
  } catch (error) {
    console.error('List files error:', error)
    return NextResponse.json({ error: 'Failed to list files' }, { status: 500 })
  }
}
