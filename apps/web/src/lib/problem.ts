/** API'nin RFC 7807 hata gövdesi. */
export interface Problem {
  status: number;
  code: string;
  title?: string;
  detail?: string;
  errors?: { path: string; message: string }[];
  [k: string]: unknown;
}

export class ApiError extends Error {
  constructor(readonly problem: Problem) {
    super(problem.detail ?? problem.title ?? problem.code);
    this.name = 'ApiError';
  }
  get status() {
    return this.problem.status;
  }
  get code() {
    return this.problem.code;
  }
}

export async function toProblem(res: Response): Promise<Problem> {
  try {
    const body = (await res.json()) as Partial<Problem>;
    return { status: res.status, code: body.code ?? `HTTP_${res.status}`, ...body };
  } catch {
    return { status: res.status, code: `HTTP_${res.status}`, detail: res.statusText };
  }
}
