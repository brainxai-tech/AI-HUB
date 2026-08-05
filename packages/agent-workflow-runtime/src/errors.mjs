export class WorkflowError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.name = "WorkflowError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function publicError(error) {
  if (error instanceof WorkflowError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "工作流执行失败，请稍后重试。",
  };
}
