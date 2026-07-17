export interface RequestContext {
  traceId: string;
  sourceIp?: string;
  requestHeaders: Record<string, string | string[] | undefined>;
}
