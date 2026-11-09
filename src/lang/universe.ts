// The per-unit domain: records and enums. Passed around explicitly, never global.
import type { JType } from './types';
import type { Member } from './members';
import type { JEnum } from '../engine/values';

export interface Field { name: string; type: JType }
export interface RecordDef { name: string; fields: Field[]; extras?: Member[] }
export interface EnumDef { name: string; constants: string[] }

export class Universe {
  records: Record<string, RecordDef> = {};
  enums: Record<string, EnumDef> = {};
  private vals = new Map<string, JEnum[]>();

  constructor(records: RecordDef[], enums: EnumDef[]) {
    for (const r of records) this.records[r.name] = r;
    for (const e of enums) {
      this.enums[e.name] = e;
      this.vals.set(
        e.name,
        e.constants.map((c, i) => Object.freeze({ $enum: e.name, name: c, ordinal: i }) as JEnum),
      );
    }
  }

  enumValues(enumName: string): JEnum[] {
    return this.vals.get(enumName) ?? [];
  }

  enumValue(enumName: string, constant: string): JEnum {
    const v = this.enumValues(enumName).find((x) => x.name === constant);
    if (!v) throw new Error(`Unknown enum constant ${enumName}.${constant}`);
    return v;
  }

  /** Is `id` a class name for the parser (records, enums and a few well-known library classes)? */
  kindOf = (id: string): 'enum' | 'class' | undefined => {
    if (this.enums[id]) return 'enum';
    if (this.records[id] || LIBRARY_CLASSES.includes(id)) return 'class';
    return undefined;
  };
}

export const LIBRARY_CLASSES = [
  'Comparator', 'Collectors', 'Stream', 'Map', 'Integer', 'Math', 'Function', 'String', 'List', 'Optional',
];

export const makeUniverse = (records: RecordDef[], enums: EnumDef[]) => new Universe(records, enums);
