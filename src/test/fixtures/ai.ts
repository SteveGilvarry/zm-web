import type { AiDataset, AiModel, AiObjectClass } from '@/api/ai';

/** An AI dataset row (`GET /api/v3/ai/datasets`). The box ships COCO. */
export function makeAiDataset(overrides: Partial<AiDataset> = {}): AiDataset {
  return {
    id: 1,
    name: 'COCO',
    description: 'Microsoft Common Objects in Context',
    version: '2017',
    num_classes: 80,
    ...overrides,
  };
}

/** An AI model row (`GET /api/v3/ai/models`), dataset name joined by the list. */
export function makeAiModel(overrides: Partial<AiModel> = {}): AiModel {
  return {
    id: 1,
    name: 'yolov8n',
    framework: 'ONNX',
    version: '8.0',
    description: null,
    model_path: '/var/lib/zoneminder/models/yolov8n.onnx',
    dataset_id: 1,
    dataset_name: 'COCO',
    enabled: 1,
    ...overrides,
  };
}

/** An object class row (`GET /api/v3/ai/object-classes`). */
export function makeAiObjectClass(overrides: Partial<AiObjectClass> = {}): AiObjectClass {
  return {
    id: 1,
    dataset_id: 1,
    class_name: 'person',
    class_index: 0,
    description: 'Person',
    ...overrides,
  };
}
