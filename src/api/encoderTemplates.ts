import { apiGet, apiPost, apiPut, apiDelete } from './client';

/**
 * Encoder templates (`EncoderTemplates`, zm-api#144): named `key=value`
 * parameter sets for an encoder, which legacy's monitor editor applies to
 * Encoder Parameters (`monitor.php:1281`) and Options → Encoder Templates
 * lists and edits. The list is unpaginated.
 */
export interface EncoderTemplate {
  id: number;
  /** The encoder the parameters are for, e.g. `libx264`, `h264_nvenc`. */
  encoder: string;
  name: string;
  description?: string | null;
  /** `key=value` lines handed to the encoder. */
  params: string;
}

export interface EncoderTemplateInput {
  encoder: string;
  name: string;
  description?: string | null;
  params: string;
}

export async function listEncoderTemplates(): Promise<EncoderTemplate[]> {
  return apiGet<EncoderTemplate[]>('/encoder-templates');
}

export async function getEncoderTemplate(id: number): Promise<EncoderTemplate> {
  return apiGet<EncoderTemplate>(`/encoder-templates/${id}`);
}

export async function createEncoderTemplate(input: EncoderTemplateInput): Promise<EncoderTemplate> {
  return apiPost<EncoderTemplateInput, EncoderTemplate>('/encoder-templates', input);
}

/** `description: null` clears it; an omitted field is left alone. */
export async function updateEncoderTemplate(id: number, input: Partial<EncoderTemplateInput>): Promise<EncoderTemplate> {
  return apiPut<Partial<EncoderTemplateInput>, EncoderTemplate>(`/encoder-templates/${id}`, input);
}

export async function deleteEncoderTemplate(id: number): Promise<void> {
  return apiDelete(`/encoder-templates/${id}`);
}
