/** A failure with an HTTP status, thrown inside agent API handlers and turned into a JSON error. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}
