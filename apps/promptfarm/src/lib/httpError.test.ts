import assert from "node:assert/strict";
import axios from "axios";

import { getHttpErrorDetails } from "./httpError";

function runAxiosErrorTest(): void {
  const error = new axios.AxiosError(
    "Request failed with status code 404",
    "ERR_BAD_REQUEST",
    {
      url: "https://example.com/db/projects/project-1/draft",
      method: "put",
      headers: {},
    },
    undefined,
    {
      status: 404,
      statusText: "Not Found",
      headers: {},
      config: {
        url: "https://example.com/db/projects/project-1/draft",
        method: "put",
        headers: {},
      },
      data: { error: "Project not found" },
    },
  );

  const details = getHttpErrorDetails(error);

  assert.equal(details.message, "Request failed with status code 404");
  assert.equal(details.status, 404);
  assert.equal(details.method, "PUT");
  assert.equal(details.url, "https://example.com/db/projects/project-1/draft");
  assert.deepEqual(details.responseData, { error: "Project not found" });
}

function runGenericErrorTest(): void {
  const details = getHttpErrorDetails(new Error("boom"));

  assert.equal(details.message, "boom");
  assert.equal(details.status, null);
  assert.equal(details.method, null);
  assert.equal(details.url, null);
  assert.equal(details.responseData, null);
}

runAxiosErrorTest();
runGenericErrorTest();

console.log("httpError tests passed");
