import axios from "axios";

export type HttpErrorDetails = {
  message: string;
  status: number | null;
  method: string | null;
  url: string | null;
  responseData: unknown;
};

export function getHttpErrorDetails(error: unknown): HttpErrorDetails {
  if (axios.isAxiosError(error)) {
    return {
      message: error.message,
      status: error.response?.status ?? null,
      method: error.config?.method?.toUpperCase() ?? null,
      url: error.config?.url ?? null,
      responseData: error.response?.data ?? null,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      status: null,
      method: null,
      url: null,
      responseData: null,
    };
  }

  return {
    message: "Unknown error",
    status: null,
    method: null,
    url: null,
    responseData: null,
  };
}
