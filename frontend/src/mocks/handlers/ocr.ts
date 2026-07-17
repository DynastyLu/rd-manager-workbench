import { http, HttpResponse } from 'msw'

interface MockJob {
  id: string
  status: 'succeeded'
  result: unknown
}

const jobs = new Map<string, MockJob>()
let nextJobId = 1

export const ocrHandlers = [
  /** POST /api/recognize */
  http.post('/api/recognize', () =>
    createPendingJob('ocr', '/api/tools/ocr/jobs', {
      rows: [
        ['Header A', 'Header B', 'Header C'],
        ['Cell 1', 'Cell 2', 'Cell 3'],
        ['Cell 4', 'Cell 5', 'Cell 6'],
      ],
      cell_confidence: [
        [0.95, 0.92],
        [0.88, 0.91],
      ],
      merged_cells: [{ from: [0, 0], to: [0, 1] }],
    })
  ),

  /** POST /api/export */
  http.post('/api/export', () =>
    createPendingJob('export', '/api/tools/ocr/jobs', {
      downloadUrl: '/api/files/mock-export/download',
    })
  ),

  /** POST /api/export-batch */
  http.post('/api/export-batch', () =>
    createPendingJob('batch-export', '/api/tools/ocr/jobs', {
      downloadUrl: '/api/files/mock-batch-export/download',
    })
  ),

  /** POST /api/hairstyle/transform */
  http.post('/api/hairstyle/transform', async ({ request }) => {
    const form = await request.formData()
    const style = String(form.get('style') || 'short-bob')

    return createPendingJob('hairstyle', '/api/tools/hairstyle/jobs', {
      mode: 'demo',
      data: {
        imageUrl:
          'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
        style,
        label: style,
      },
    })
  }),

  /** GET /api/hairstyle/styles */
  http.get('/api/hairstyle/styles', () =>
    HttpResponse.json({
      success: true,
      data: [
        { id: 'short-bob', label: 'Short bob' },
        { id: 'air-bangs', label: 'Air bangs' },
        { id: 'long-wave', label: 'Long wave' },
        { id: 'silver-wolf', label: 'Silver wolf' },
      ],
    })
  ),

  /** GET /api/jobs/:jobId */
  http.get('/api/jobs/:jobId', ({ params }) => {
    const job = jobs.get(String(params.jobId))
    if (!job) {
      return HttpResponse.json(
        {
          success: false,
          error: {
            message: 'Job not found',
          },
        },
        { status: 404 }
      )
    }

    return HttpResponse.json({
      success: true,
      data: job,
    })
  }),

  /** GET /api/files/:fileId/download */
  http.get('/api/files/:fileId/download', () => {
    const blob = new Blob(['mock-xlsx-content'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    return new HttpResponse(blob, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    })
  }),
]

function createPendingJob(kind: string, resultBaseUrl: string, result: unknown) {
  const jobId = `mock-${kind}-${nextJobId++}`
  jobs.set(jobId, {
    id: jobId,
    status: 'succeeded',
    result,
  })

  return HttpResponse.json(
    {
      success: false,
      pending: true,
      jobId,
      statusUrl: `/api/jobs/${jobId}`,
      resultUrl: `${resultBaseUrl}/${jobId}/result`,
    },
    { status: 202 }
  )
}
