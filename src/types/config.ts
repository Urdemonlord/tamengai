/**
 * Configuration Manager types
 */

import { Language } from './common';

/** Safe response trigger types */
export type SafeResponseTrigger = 'BLOCK_INPUT' | 'FILTER_OUTPUT' | 'ERROR' | 'UNCERTAIN';

/** Safe response template */
export interface SafeResponseTemplate {
  id: string;
  triggerType: SafeResponseTrigger;
  language: Language;
  message: string;
  enabled: boolean;
}

/** System configuration */
export interface SystemConfig {
  preFilterEnabled: boolean;
  postFilterEnabled: boolean;
  llmJudgeEnabled: boolean;
  maxProcessingTimeMs: number;
  defaultAction: 'BLOCK' | 'PASS';
  confidenceThreshold: number;
  safeResponseTemplates: SafeResponseTemplate[];
  version: number;
  updatedAt: Date;
  updatedBy: string;
}

/** Configuration change types */
export type ConfigChangeType = 'CREATE' | 'UPDATE' | 'DELETE';

/** Configuration change audit record */
export interface ConfigChange {
  id: string;
  timestamp: Date;
  adminId: string;
  changeType: ConfigChangeType;
  previousValue: string;
  newValue: string;
  component: string;
}

/** Configuration Manager interface */
export interface IConfigurationManager {
  getConfig(): Promise<SystemConfig>;
  updateConfig(updates: Partial<SystemConfig>, adminId: string): Promise<void>;
  exportConfig(): Promise<string>;
  importConfig(configJson: string, adminId: string): Promise<void>;
  getConfigHistory(): Promise<ConfigChange[]>;
  getSafeResponse(trigger: SafeResponseTrigger, language: Language): string;
}
