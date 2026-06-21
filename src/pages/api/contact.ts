export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'astro/zod';

const contactSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Please enter a valid email address'),
  subject: z.string().max(200).optional(),
  message: z.string().min(10, 'Message must be at least 10 characters').max(5000),
  honeypot: z.string().optional(),
});

const ALLOWED_ORIGINS = [
  'https://assetbolt.com',
  'https://www.assetbolt.com',
];

const MAX_REQUESTS_PER_MINUTE = 5;
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const timestamps = requestLog.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < windowMs);
  recent.push(now);
  requestLog.set(ip, recent);

  if (requestLog.size > 10_000) {
    for (const [key, val] of requestLog) {
      const filtered = val.filter((t) => now - t < windowMs);
      if (filtered.length === 0) requestLog.delete(key);
      else requestLog.set(key, filtered);
    }
  }

  return recent.length > MAX_REQUESTS_PER_MINUTE;
}

function getClientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

function getCorsOrigin(request: Request): string {
  const origin = request.headers.get('origin') ?? '';
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
    return origin;
  }
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin') ?? '';
  if (!origin) return false;
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
    return true;
  }
  return ALLOWED_ORIGINS.includes(origin);
}

function corsHeaders(request: Request): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': getCorsOrigin(request),
    'Vary': 'Origin',
  };
}

const MAX_BODY_SIZE = 64 * 1024; // 64KB

export const POST: APIRoute = async ({ request }) => {
  const headers = corsHeaders(request);

  if (!isAllowedOrigin(request)) {
    return new Response(
      JSON.stringify({ success: false, error: 'Forbidden' }),
      { status: 403, headers }
    );
  }

  const clientIp = getClientIp(request);
  if (isRateLimited(clientIp)) {
    return new Response(
      JSON.stringify({ success: false, error: 'Too many requests. Please try again later.' }),
      { status: 429, headers }
    );
  }

  const contentLength = parseInt(request.headers.get('content-length') ?? '0', 10);
  if (contentLength > MAX_BODY_SIZE) {
    return new Response(
      JSON.stringify({ success: false, error: 'Request too large' }),
      { status: 413, headers }
    );
  }

  try {
    const formData = await request.formData();

    const data = {
      name: formData.get('name')?.toString() || '',
      email: formData.get('email')?.toString() || '',
      subject: formData.get('subject')?.toString() || '',
      message: formData.get('message')?.toString() || '',
      honeypot: formData.get('honeypot')?.toString() || '',
    };

    // Validate
    const result = contactSchema.safeParse(data);

    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const error of result.error.issues) {
        const field = error.path[0] as string;
        if (!fieldErrors[field]) {
          fieldErrors[field] = [];
        }
        fieldErrors[field].push(error.message);
      }

      return new Response(
        JSON.stringify({
          success: false,
          errors: fieldErrors,
        }),
        { status: 400, headers }
      );
    }

    // Honeypot check (bot detection)
    if (result.data.honeypot) {
      // Pretend success but don't process
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers,
      });
    }

    // Process the submission
    // In a real application, you would:
    // - Send an email notification
    // - Store in a database
    // - Forward to a CRM
    // - etc.

    // For now, we just log it (in production, replace with actual handling)
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('Contact form submission:', {
        name: result.data.name,
        email: result.data.email,
        subject: result.data.subject,
        message: result.data.message,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers,
    });
  } catch (error) {
    console.error('Contact form error:', error instanceof Error ? error.message : 'Unknown error');

    return new Response(
      JSON.stringify({
        success: false,
        errors: { form: ['An unexpected error occurred'] },
      }),
      { status: 500, headers }
    );
  }
};

// Handle CORS preflight
export const OPTIONS: APIRoute = async ({ request }) => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': getCorsOrigin(request),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    },
  });
};
