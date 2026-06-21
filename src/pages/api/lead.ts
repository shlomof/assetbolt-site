export const prerender = false;

import type { APIRoute } from 'astro';
import { upsertContact, addContactTags } from '../../lib/ghl';
import { validateLeadForm, splitName } from '../../lib/validation';
import type { APIResponse } from '../../lib/types';

const ALLOWED_TAGS = [
  'website_lead',
  'funnel_signup',
  'website_contact',
  'funnel_blueprint',
  'squeeze_page',
  'sales_letter',
  'vsl_page',
  'pas_page',
  'lead_magnet',
  'form_qualify',
  'workshop_signup',
  // TODO: Add your custom tags here
];

const MAX_REQUESTS_PER_MINUTE = 10;
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const timestamps = requestLog.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < windowMs);
  recent.push(now);
  requestLog.set(ip, recent);

  // Prune old entries periodically
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

const ALLOWED_ORIGINS = [
  'https://assetbolt.com',
  'https://www.assetbolt.com',
];

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

function sanitizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return ['website_lead'];
  return input
    .filter((tag): tag is string => typeof tag === 'string' && ALLOWED_TAGS.includes(tag))
    .slice(0, 5);
}

const MAX_BODY_SIZE = 16 * 1024; // 16KB

export const POST: APIRoute = async ({ request, locals }) => {
  const corsOrigin = getCorsOrigin(request);
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin,
    'Vary': 'Origin',
  };

  // Origin validation
  if (!isAllowedOrigin(request)) {
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Forbidden',
      } satisfies APIResponse),
      { status: 403, headers }
    );
  }

  // Rate limit
  const clientIp = getClientIp(request);
  if (isRateLimited(clientIp)) {
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Too many requests. Please try again later.',
      } satisfies APIResponse),
      { status: 429, headers }
    );
  }

  // Body size limit
  const contentLength = parseInt(request.headers.get('content-length') ?? '0', 10);
  if (contentLength > MAX_BODY_SIZE) {
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Request too large',
      } satisfies APIResponse),
      { status: 413, headers }
    );
  }

  // Reject non-JSON content types
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Content-Type must be application/json',
      } satisfies APIResponse),
      { status: 415, headers }
    );
  }

  try {
    const body = await request.json();

    // Validate
    const validation = validateLeadForm(body);
    if (!validation.valid || !validation.data) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Validation failed',
          errors: validation.errors,
        } satisfies APIResponse & { errors: Record<string, string> }),
        { status: 400, headers }
      );
    }

    // Get env vars
    const runtime = (locals as Record<string, unknown>).runtime as { env: Record<string, string> } | undefined;
    const apiKey = runtime?.env?.GHL_API_KEY || import.meta.env.GHL_API_KEY;
    const locationId = runtime?.env?.GHL_LOCATION_ID || import.meta.env.GHL_LOCATION_ID;

    if (!apiKey || !locationId) {
      const missing = [!apiKey && 'GHL_API_KEY', !locationId && 'GHL_LOCATION_ID'].filter(Boolean).join(', ');
      console.error(`Missing GHL environment variables: ${missing}`);
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Server configuration error',
        } satisfies APIResponse),
        { status: 500, headers }
      );
    }

    // Build GHL payload
    const { firstName, lastName } = splitName(validation.data.name);
    const tags = sanitizeTags(body.tags);
    if (tags.length === 0) tags.push('website_lead');

    const result = await upsertContact(
      {
        firstName,
        lastName,
        email: validation.data.email,
        phone: validation.data.phone,
        locationId,
        source: 'Website',
      },
      apiKey
    );

    if (result.success) {
      // Append tags via dedicated endpoint (never overwrites existing tags)
      if (result.contactId && tags.length > 0) {
        await addContactTags(result.contactId, tags, apiKey);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: result.isDuplicate ? 'Contact updated' : 'Contact created',
        } satisfies APIResponse),
        { status: 200, headers }
      );
    }

    if (result.statusCode === 401 || result.statusCode === 403) {
      console.error('GHL authorization error — check API key scopes. Required: contacts.write');
    }
    console.error('GHL API error:', result.statusCode);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Something went wrong. Please try again.',
      } satisfies APIResponse),
      { status: 502, headers }
    );
  } catch (error) {
    console.error('Lead API error:', error instanceof Error ? error.message : 'Unknown error');
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Invalid request',
      } satisfies APIResponse),
      { status: 400, headers }
    );
  }
};

// Handle CORS preflight
export const OPTIONS: APIRoute = async ({ request }) => {
  const corsOrigin = getCorsOrigin(request);
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    },
  });
};
