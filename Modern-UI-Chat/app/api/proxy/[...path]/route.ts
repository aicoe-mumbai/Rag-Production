import { NextRequest, NextResponse } from 'next/server';

// Backend URLs (only used server-side, not exposed to the client)
const DJANGO_API_URL = process.env.DJANGO_API_URL || 'http://localhost:8000';
const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8444';
const TGI_SERVER_URL = process.env.TGI_SERVER_URL || 'http://localhost:8080';

export async function GET(
  request: NextRequest,
  context: { params: { path: string[] } }
) {
  const params = await context.params;
  return await proxyRequest(request, params.path, 'GET');
}

export async function POST(
  request: NextRequest,
  context: { params: { path: string[] } }
) {
  const params = await context.params;
  return await proxyRequest(request, params.path, 'POST');
}

export async function PUT(
  request: NextRequest,
  context: { params: { path: string[] } }
) {
  const params = await context.params;
  return await proxyRequest(request, params.path, 'PUT');
}

export async function DELETE(
  request: NextRequest,
  context: { params: { path: string[] } }
) {
  const params = await context.params;
  return await proxyRequest(request, params.path, 'DELETE');
}

export async function PATCH(
  request: NextRequest,
  context: { params: { path: string[] } }
) {
  const params = await context.params;
  return await proxyRequest(request, params.path, 'PATCH');
}

async function proxyRequest(
  request: NextRequest,
  pathSegments: string[],
  method: string
) {
  try {
    // Reconstruct the path from the segments
    const path = pathSegments.join('/');
    
    // Get the search params
    const searchParams = request.nextUrl.searchParams.toString();
    const queryString = searchParams ? `?${searchParams}` : '';
    
    // Determine which backend to use based on the path
    let baseUrl = DJANGO_API_URL;
    let targetPath = path;
    
    // If the path starts with 'python', use the Python backend
    if (path.startsWith('python')) {
      baseUrl = PYTHON_API_URL;
      // Remove the 'python' prefix from the path
      targetPath = path.substring(7); // 'python/'.length = 7
    }
    // If the path starts with 'tgi', use the TGI server
    else if (path.startsWith('tgi')) {
      baseUrl = TGI_SERVER_URL;
      // Remove the 'tgi' prefix from the path
      targetPath = path.substring(4); // 'tgi/'.length = 4
    }
    
    // Construct the full URL to the appropriate backend
    const url = `${baseUrl}/${targetPath}${queryString}`;
    
    // Get the request headers
    const headers = new Headers();
    request.headers.forEach((value, key) => {
      // Skip the host header as it will be set automatically
      if (key.toLowerCase() !== 'host') {
        headers.append(key, value);
      }
    });

    // Create the fetch options
    const fetchOptions: RequestInit = {
      method,
      headers,
      redirect: 'follow',
    };

    // Add the body for non-GET requests
    if (method !== 'GET' && method !== 'HEAD') {
      const contentType = request.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        // For JSON requests, parse and stringify the body
        const body = await request.json();
        fetchOptions.body = JSON.stringify(body);
      } else {
        // For other types, just pass through the body
        fetchOptions.body = await request.text();
      }
    }

    // Make the request to the Django backend
    const response = await fetch(url, fetchOptions);
    
    // Get the response headers
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      // Skip the content-encoding header as it can cause issues
      if (key.toLowerCase() !== 'content-encoding') {
        responseHeaders.append(key, value);
      }
    });

    // Get the response body
    const responseBody = await response.arrayBuffer();
    
    // Return the proxied response
    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy request to backend' },
      { status: 500 }
    );
  }
}