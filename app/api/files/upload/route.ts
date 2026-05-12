import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import { minioClient, BUCKET_NAME, ensureBucket } from '@/lib/minio'

function generateFileId(): string {
  const min = 100000
  const max = 999999
  return Math.floor(Math.random() * (max - min + 1) + min).toString()
}

async function fileIdExists(id: string): Promise<boolean> {
  try {
    await minioClient.statObject(BUCKET_NAME, id)
    return true
  } catch {
    return false
  }
}

async function generateUniqueId(): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const id = generateFileId()
    if (!(await fileIdExists(id))) return id
  }
  throw new Error('Could not generate unique file ID')
}

function getPreviewKind(fileName: string, mimeType: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  if (mimeType === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (ext === 'csv') return 'csv'
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx'
  if (
    mimeType.startsWith('text/') ||
    ['txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'html', 'css'].includes(ext)
  )
    return 'text'
  return 'unsupported'
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const path = (formData.get('path') as string | null) || ''

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    await ensureBucket()

    const fileId = await generateUniqueId()
    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    const mimeType = file.type || 'application/octet-stream'
    const previewKind = getPreviewKind(file.name, mimeType)
    const uploadedAt = Date.now()
    const filePath = path || file.name

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const stream = Readable.from(buffer)

    const metaData = {
      'Content-Type': mimeType,
      'x-amz-meta-name': encodeURIComponent(file.name),
      'x-amz-meta-path': encodeURIComponent(filePath),
      'x-amz-meta-extension': extension,
      'x-amz-meta-previewkind': previewKind,
      'x-amz-meta-size': file.size.toString(),
      'x-amz-meta-uploadedat': uploadedAt.toString(),
    }

    await minioClient.putObject(BUCKET_NAME, fileId, stream, buffer.length, metaData)

    return NextResponse.json({
      id: fileId,
      name: file.name,
      path: filePath,
      extension,
      size: file.size,
      previewKind,
      uploadedAt,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
