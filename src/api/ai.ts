import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { PaginatedResponse } from '@/types';

/**
 * AI object-detection catalogue: datasets, the models trained on them, and
 * the object classes a dataset defines. These back ZoneMinder 1.39's
 * Options → AI Datasets / AI Models / AI Classes tabs
 * (`_options_ai_datasets.php` and friends), which read the `AI_Datasets`,
 * `AI_Models` and `AI_Object_Classes` tables directly.
 *
 * Deleting a dataset cascades to its object classes — the backend says so
 * on `DELETE /ai/datasets/{id}`, and the pages warn before they call it.
 */

export interface AiDataset {
  id: number;
  name: string;
  description?: string | null;
  version?: string | null;
  /** Classes the dataset defines (COCO = 80). */
  num_classes: number;
}

/** The frameworks the backend's `Framework` enum accepts. */
export const AI_FRAMEWORKS = [
  'TensorFlow',
  'PyTorch',
  'ONNX',
  'OpenVINO',
  'TensorRT',
  'Other',
] as const;
export type AiFramework = (typeof AI_FRAMEWORKS)[number];

export interface AiModel {
  id: number;
  name: string;
  framework: string;
  version?: string | null;
  description?: string | null;
  /** Filesystem path to the weights. */
  model_path?: string | null;
  dataset_id?: number | null;
  /** Joined by the list endpoint; absent on the single-model read. */
  dataset_name?: string | null;
  enabled: number;
}

export interface AiObjectClass {
  id: number;
  dataset_id: number;
  class_name: string;
  /** Index this class occupies in the model's output vector. */
  class_index: number;
  description?: string | null;
}

export interface CreateAiDatasetInput {
  name: string;
  num_classes: number;
  version?: string | null;
  description?: string | null;
}
export type UpdateAiDatasetInput = Partial<CreateAiDatasetInput>;

export interface CreateAiModelInput {
  name: string;
  framework?: AiFramework | null;
  version?: string | null;
  description?: string | null;
  model_path?: string | null;
  dataset_id?: number | null;
  enabled?: number | null;
}
export type UpdateAiModelInput = Partial<CreateAiModelInput>;

export interface CreateAiObjectClassInput {
  dataset_id: number;
  class_name: string;
  class_index: number;
  description?: string | null;
}
export type UpdateAiObjectClassInput = Partial<CreateAiObjectClassInput>;

type Page = { page?: number; page_size?: number };

/* ----- Datasets ---------------------------------------------------------- */

export async function listAiDatasets(params?: Page): Promise<PaginatedResponse<AiDataset>> {
  return apiGet<PaginatedResponse<AiDataset>>('/ai/datasets', params);
}

export async function getAiDataset(id: number): Promise<AiDataset> {
  return apiGet<AiDataset>(`/ai/datasets/${id}`);
}

export async function createAiDataset(data: CreateAiDatasetInput): Promise<AiDataset> {
  return apiPost<CreateAiDatasetInput, AiDataset>('/ai/datasets', data);
}

export async function updateAiDataset(id: number, data: UpdateAiDatasetInput): Promise<AiDataset> {
  return apiPatch<UpdateAiDatasetInput, AiDataset>(`/ai/datasets/${id}`, data);
}

/** Cascades: the dataset's object classes go with it. */
export async function deleteAiDataset(id: number): Promise<void> {
  return apiDelete(`/ai/datasets/${id}`);
}

/* ----- Models ------------------------------------------------------------ */

export async function listAiModels(params?: Page): Promise<PaginatedResponse<AiModel>> {
  return apiGet<PaginatedResponse<AiModel>>('/ai/models', params);
}

export async function getAiModel(id: number): Promise<AiModel> {
  return apiGet<AiModel>(`/ai/models/${id}`);
}

export async function createAiModel(data: CreateAiModelInput): Promise<AiModel> {
  return apiPost<CreateAiModelInput, AiModel>('/ai/models', data);
}

export async function updateAiModel(id: number, data: UpdateAiModelInput): Promise<AiModel> {
  return apiPatch<UpdateAiModelInput, AiModel>(`/ai/models/${id}`, data);
}

export async function deleteAiModel(id: number): Promise<void> {
  return apiDelete(`/ai/models/${id}`);
}

/* ----- Object classes ---------------------------------------------------- */

export async function listAiObjectClasses(
  params?: Page & { dataset_id?: number },
): Promise<PaginatedResponse<AiObjectClass>> {
  return apiGet<PaginatedResponse<AiObjectClass>>('/ai/object-classes', params);
}

export async function getAiObjectClass(id: number): Promise<AiObjectClass> {
  return apiGet<AiObjectClass>(`/ai/object-classes/${id}`);
}

export async function createAiObjectClass(data: CreateAiObjectClassInput): Promise<AiObjectClass> {
  return apiPost<CreateAiObjectClassInput, AiObjectClass>('/ai/object-classes', data);
}

export async function updateAiObjectClass(
  id: number,
  data: UpdateAiObjectClassInput,
): Promise<AiObjectClass> {
  return apiPatch<UpdateAiObjectClassInput, AiObjectClass>(`/ai/object-classes/${id}`, data);
}

export async function deleteAiObjectClass(id: number): Promise<void> {
  return apiDelete(`/ai/object-classes/${id}`);
}
