export class NextResponse extends Response {
  static json(value, init = {}) {
    const headers = new Headers(init.headers);
    if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
    return new NextResponse(JSON.stringify(value), { ...init, headers });
  }

  static redirect(url, status = 307) {
    return new NextResponse(null, { status, headers: { location: String(url) } });
  }
}
