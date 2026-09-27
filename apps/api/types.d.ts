export {};

declare module 'next/server' {
  export class NextRequest extends Request {
    public nextUrl: import('url').URL & {
      pathname: string;
      searchParams: URLSearchParams;
      clone(): NextRequest['nextUrl'];
    };
    public cookies: {
      get(name: string): { name: string; value: string } | undefined;
      getAll(): { name: string; value: string }[];
      set(name: string, value: string): void;
      delete(name: string): void;
      has(name: string): boolean;
      clear(): void;
    };
    public ip?: string;
    public geo?: {
      city?: string;
      country?: string;
      region?: string;
      latitude?: string;
      longitude?: string;
    };
  }

  export class NextResponse<Body = unknown> extends Response {
    static json<T>(body: T, init?: ResponseInit): NextResponse<T>;
    static redirect(url: string | URL, init?: number | ResponseInit): NextResponse;
    static rewrite(destination: string | URL, init?: any): NextResponse;
    static next(init?: any): NextResponse;
  }
}

declare global {
  interface RequestInit {
    next?: { revalidate?: number | false; tags?: string[] };
  }
}
