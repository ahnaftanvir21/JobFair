import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
/** Minimal OpenAPI schema for a form field. */
type SchemaObject = {
  type: 'string' | 'boolean' | 'number' | 'integer';
  format?: string;
  description?: string;
  enum?: string[];
  example?: unknown;
};
import { MAX_UPLOAD_BYTES } from './file-storage.service.js';

/** Field name every upload endpoint uses for the file. */
export const FILE_FIELD = 'file';

/** Interceptor that keeps the upload in memory, capped at 5 MB. */
export function FileUpload() {
  return UseInterceptors(
    FileInterceptor(FILE_FIELD, {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  );
}

/**
 * Multipart endpoint with one file plus optional form fields, documented in Swagger.
 */
export function ApiFileUpload(
  description: string,
  options: {
    fileRequired?: boolean;
    fields?: Record<string, SchemaObject>;
    requiredFields?: string[];
  } = {},
) {
  const { fileRequired = true, fields = {}, requiredFields = [] } = options;
  return applyDecorators(
    FileUpload(),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      description,
      schema: {
        type: 'object',
        required: [...(fileRequired ? [FILE_FIELD] : []), ...requiredFields],
        properties: {
          [FILE_FIELD]: { type: 'string', format: 'binary' },
          ...fields,
        },
      },
    }),
  );
}
