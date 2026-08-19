export function mutableAssetResponse(res: Response): Response {
  return new Response(res.body, res);
}

export function apiNotFound(): Response {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
