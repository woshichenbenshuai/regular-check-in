export function errorInfo(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause
    };
  }

  return {
    message: String(error)
  };
}
