import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { parse } from "valibot";

import { uploadAttachmentsResponseSchema } from "../../shared/acp.ts";
import { errorResponseSchema, jsonResponse } from "../hono-utils.ts";
import { ingestAttachments } from "./store.ts";

const toFiles = (values: readonly FormDataEntryValue[]): readonly File[] => {
  const files: File[] = [];

  for (const value of values) {
    if (value instanceof File) {
      files.push(value);
    }
  }

  return files;
};

export const attachmentRoutes = new Hono().post(
  "/ingest",
  describeRoute({
    summary: "Ingest browser attachments",
    responses: {
      201: jsonResponse("Ingested attachments", uploadAttachmentsResponseSchema),
      400: jsonResponse("Attachment ingest error", errorResponseSchema),
    },
  }),
  async (c) => {
    try {
      const formData = await c.req.formData();
      const files = toFiles(formData.getAll("files"));
      const response = parse(uploadAttachmentsResponseSchema, {
        attachments: await ingestAttachments(files),
      });
      return c.json(response, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to ingest attachments";
      return c.json({ error: message }, 400);
    }
  },
);
