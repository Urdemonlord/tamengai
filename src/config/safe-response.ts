/**
 * Safe Response Template Management
 */

import { v4 as uuidv4 } from 'uuid';
import { SafeResponseTemplate, SafeResponseTrigger } from '../types/config';
import { Language } from '../types/common';

/** Default safe response templates */
const DEFAULT_TEMPLATES: SafeResponseTemplate[] = [
  // Indonesian templates
  {
    id: uuidv4(),
    triggerType: 'BLOCK_INPUT',
    language: 'ID',
    message: 'Maaf, permintaan Anda tidak dapat diproses karena melanggar kebijakan keamanan kami.',
    enabled: true
  },
  {
    id: uuidv4(),
    triggerType: 'FILTER_OUTPUT',
    language: 'ID',
    message: 'Maaf, respons tidak dapat ditampilkan karena melanggar kebijakan konten kami.',
    enabled: true
  },
  {
    id: uuidv4(),
    triggerType: 'ERROR',
    language: 'ID',
    message: 'Terjadi kesalahan dalam memproses permintaan Anda. Silakan coba lagi.',
    enabled: true
  },
  {
    id: uuidv4(),
    triggerType: 'UNCERTAIN',
    language: 'ID',
    message: 'Maaf, kami tidak dapat memproses permintaan ini saat ini. Silakan coba dengan pertanyaan yang berbeda.',
    enabled: true
  },
  // English templates
  {
    id: uuidv4(),
    triggerType: 'BLOCK_INPUT',
    language: 'EN',
    message: 'Sorry, your request cannot be processed as it violates our security policies.',
    enabled: true
  },
  {
    id: uuidv4(),
    triggerType: 'FILTER_OUTPUT',
    language: 'EN',
    message: 'Sorry, the response cannot be displayed as it violates our content policies.',
    enabled: true
  },
  {
    id: uuidv4(),
    triggerType: 'ERROR',
    language: 'EN',
    message: 'An error occurred while processing your request. Please try again.',
    enabled: true
  },
  {
    id: uuidv4(),
    triggerType: 'UNCERTAIN',
    language: 'EN',
    message: 'Sorry, we cannot process this request at this time. Please try a different question.',
    enabled: true
  },
  // Both languages (fallback)
  {
    id: uuidv4(),
    triggerType: 'BLOCK_INPUT',
    language: 'BOTH',
    message: 'Request blocked / Permintaan diblokir',
    enabled: true
  },
  {
    id: uuidv4(),
    triggerType: 'FILTER_OUTPUT',
    language: 'BOTH',
    message: 'Content filtered / Konten difilter',
    enabled: true
  },
  {
    id: uuidv4(),
    triggerType: 'ERROR',
    language: 'BOTH',
    message: 'Error occurred / Terjadi kesalahan',
    enabled: true
  },
  {
    id: uuidv4(),
    triggerType: 'UNCERTAIN',
    language: 'BOTH',
    message: 'Cannot process / Tidak dapat memproses',
    enabled: true
  }
];

/**
 * Safe Response Manager
 */
export class SafeResponseManager {
  private templates: Map<string, SafeResponseTemplate> = new Map();

  constructor(customTemplates?: SafeResponseTemplate[]) {
    // Load default templates
    for (const template of DEFAULT_TEMPLATES) {
      this.templates.set(template.id, template);
    }
    
    // Override with custom templates
    if (customTemplates) {
      for (const template of customTemplates) {
        this.templates.set(template.id, template);
      }
    }
  }

  /**
   * Get safe response for a trigger type and language
   */
  getSafeResponse(trigger: SafeResponseTrigger, language: Language): string {
    // Try exact language match first (prioritize by checking all templates)
    const allTemplates = Array.from(this.templates.values());
    
    // Sort to prioritize custom templates (non-default IDs) over defaults
    const exactMatch = allTemplates.find(
      t => t.triggerType === trigger && t.language === language && t.enabled
    );
    
    if (exactMatch) {
      return exactMatch.message;
    }

    // Fall back to BOTH language
    const fallback = allTemplates.find(
      t => t.triggerType === trigger && t.language === 'BOTH' && t.enabled
    );

    if (fallback) {
      return fallback.message;
    }

    // Ultimate fallback
    return 'Request cannot be processed.';
  }

  /**
   * Get all templates
   */
  getTemplates(): SafeResponseTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Add or update a template
   */
  setTemplate(template: SafeResponseTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * Remove a template
   */
  removeTemplate(templateId: string): boolean {
    return this.templates.delete(templateId);
  }

  /**
   * Check if response contains any rule information (for information hiding)
   */
  static containsRuleInfo(response: string, ruleNames: string[], patterns: string[]): boolean {
    const lowerResponse = response.toLowerCase();
    
    // Check for rule names
    for (const name of ruleNames) {
      if (lowerResponse.includes(name.toLowerCase())) {
        return true;
      }
    }
    
    // Check for patterns (but not common words)
    for (const pattern of patterns) {
      if (pattern.length > 5 && lowerResponse.includes(pattern.toLowerCase())) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Create a consolidated response for multiple violations
   */
  static createConsolidatedResponse(
    violations: Array<{ trigger: SafeResponseTrigger; count: number }>,
    language: Language
  ): string {
    // Always return a single, generic message regardless of violation count
    const manager = new SafeResponseManager();
    
    // Use the most severe trigger type
    const triggerPriority: SafeResponseTrigger[] = ['BLOCK_INPUT', 'FILTER_OUTPUT', 'UNCERTAIN', 'ERROR'];
    
    for (const trigger of triggerPriority) {
      if (violations.some(v => v.trigger === trigger)) {
        return manager.getSafeResponse(trigger, language);
      }
    }
    
    return manager.getSafeResponse('ERROR', language);
  }
}

/**
 * Create a new SafeResponseManager instance
 */
export function createSafeResponseManager(customTemplates?: SafeResponseTemplate[]): SafeResponseManager {
  return new SafeResponseManager(customTemplates);
}
