import { describe, expect, test } from "vitest";
import { parse } from "valibot";

import { Hono } from "hono";

import { uploadAttachmentsResponseSchema } from "../../shared/acp.ts";
import { attachmentRoutes } from "./routes.ts";

describe("attachmentRoutes", () => {
  test("ingests browser-selected files", async () => {
    const app = new Hono().route("/attachments", attachmentRoutes);
    const formData = new FormData();

    formData.append("files", new File(["hello world"], "notes.txt", { type: "text/plain" }));

    const response = await app.request("/attachments/ingest", {
      body: formData,
      method: "POST",
    });
    const document = parse(uploadAttachmentsResponseSchema, await response.json());

    expect(response.status).toBe(201);
    expect(document.attachments).toHaveLength(1);
    expect(typeof document.attachments[0]?.attachmentId).toBe("string");
    expect(document.attachments[0]).toMatchObject({
      mediaType: "text/plain",
      name: "notes.txt",
      sizeInBytes: 11,
    });
  });

  test("rejects ingest requests without files", async () => {
    const app = new Hono().route("/attachments", attachmentRoutes);

    const response = await app.request("/attachments/ingest", {
      body: new FormData(),
      method: "POST",
    });
    const document: unknown = await response.json();

    expect(response.status).toBe(400);
    expect(document).toMatchObject({
      error: "files are required",
    });
  });
});
