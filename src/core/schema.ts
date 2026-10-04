import { z } from 'zod';
import { DIRECTIONS } from './direction';
import type { EventScript } from './events';
import { isId, isNamespacedId, isScriptId } from './ids';
import { blobLookup, parseNeighbours } from './map/autotile';
import { SIDES } from './map/types';
import { MAX_PARTY_SIZE } from './state';

// Zod schemas for every kind of content in src/data, which `npm run validate` checks it against
// (see Content data in docs/TECH.md). They add what types can't say: IDs are kebab-case, cells are
// whole numbers, a chest holds one thing. Only the tools and the tests run them, so the game
// doesn't ship Zod: the rest of src/ imports just the types.

/** Read-only all the way down. */
type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/**
 * The type of content a schema accepts, as it's written in src/data: read-only all the way down,
 * as content never changes. A new kind of content takes its type from its schema this way, so the
 * two can't drift apart.
 */
export type ContentOf<S extends z.ZodType> = DeepReadonly<z.input<S>>;

/** Text that `test` accepts. Its problem is said of the text: `"Potion" isn't kebab-case`. */
const textThat = (test: (text: string) => boolean, problem: string) =>
  z.string().refine(test, { error: problem });

// Names and IDs (see src/core/ids.ts).

/** A name the game shows, like an item's or a map's. */
const NameSchema = z
  .string()
  .min(1)
  .refine((name) => name.trim() === name, { error: 'starts or ends with a space' });
const IdSchema = textThat(isId, "isn't kebab-case, like tide-caves-b1");
const ScriptIdSchema = textThat(isScriptId, "isn't an event script's ID, like saltmere/tamsin");
/** A key in the asset manifest (src/systems/asset-manifest.ts). Checks there say what's in it. */
const AssetKeySchema = textThat(isNamespacedId, "isn't an asset key, like tiles.floor");
const ConditionTermSchema = textThat(
  (term) => isNamespacedId(term.replace(/^!/, '')),
  "isn't a flag, or a flag with ! before it, like !story.beacon-out",
);
/** When something applies, going by flags (see src/core/conditions.ts). */
const ConditionSchema = z.union([ConditionTermSchema, z.array(ConditionTermSchema).min(1)]);

// Cells and directions.

const CellSchema = z.int().min(0);
/** A cell on a map, or a tile in a sheet: [x, y] or [col, row]. */
const GridPointSchema = z.tuple([CellSchema, CellSchema]);
const DirectionSchema = z.enum(DIRECTIONS);

// What maps are built from: terrains and prefabs (types in src/core/map/types.ts).

const FillTerrainSchema = z.strictObject({
  kind: z.literal('fill'),
  sheet: AssetKeySchema,
  /** [col, row, weight?]: how often each look appears, 1 without a weight. */
  tiles: z.array(z.tuple([CellSchema, CellSchema, z.int().min(1).optional()])).min(1),
  solid: z.boolean().optional(),
});

/** A blob layout entry's neighbours, like `'N NE E'`, as `parseNeighbours` reads them. */
const NeighboursSchema = z.string().superRefine((text, context) => {
  try {
    parseNeighbours(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    context.addIssue({ code: 'custom', message: `can't be read: ${reason}`, input: text });
  }
});

const BlobTerrainSchema = z.strictObject({
  kind: z.literal('blob'),
  sheet: AssetKeySchema,
  origin: GridPointSchema,
  /** [col, row, neighbours], relative to `origin`, so a tile can sit above or left of it. */
  layout: z
    .array(z.tuple([z.int(), z.int(), NeighboursSchema]))
    .min(1)
    .superRefine((layout, context) => {
      // Entries that can't be read are reported on their own; with them all read, no two tiles
      // may claim the same shape.
      if (!layout.every(([, , text]) => NeighboursSchema.safeParse(text).success)) return;
      try {
        blobLookup(layout);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        context.addIssue({ code: 'custom', message: `has two tiles for one shape: ${reason}` });
      }
    }),
  solid: z.boolean().optional(),
});

const TreesTerrainSchema = z.strictObject({
  kind: z.literal('trees'),
  ground: IdSchema,
  trees: z.array(IdSchema).min(1),
  filler: IdSchema,
});

const TerrainSchema = z.discriminatedUnion('kind', [
  FillTerrainSchema,
  BlobTerrainSchema,
  TreesTerrainSchema,
]);

const PrefabSchema = z.strictObject({
  sheet: AssetKeySchema,
  origin: GridPointSchema,
  layout: z
    .array(
      textThat((row) => /^[#.^=D ]+$/.test(row), "has a character that isn't # . ^ = D or a space"),
    )
    .min(1)
    .refine((layout) => layout.join('').split('D').length <= 2, {
      error: 'has more than one doorway (D)',
    }),
});

// Maps (types in src/core/map/types.ts).

const WarpTargetSchema = z.strictObject({ map: IdSchema, spawn: IdSchema });

const MapObjectSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('prefab'),
    prefab: IdSchema,
    at: GridPointSchema,
    to: WarpTargetSchema.optional(),
    script: ScriptIdSchema.optional(),
  }),
  z.strictObject({ type: z.literal('warp'), at: GridPointSchema, to: WarpTargetSchema }),
  z.strictObject({
    type: z.literal('spawn'),
    id: IdSchema,
    at: GridPointSchema,
    facing: DirectionSchema,
  }),
  z.strictObject({
    type: z.literal('npc'),
    id: IdSchema,
    /** `sprite.<sprite>` in the asset manifest. */
    sprite: IdSchema,
    at: GridPointSchema,
    facing: DirectionSchema,
    wander: CellSchema.optional(),
    script: ScriptIdSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('touch'),
    at: GridPointSchema,
    script: ScriptIdSchema,
    when: ConditionSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('enter'),
    script: ScriptIdSchema,
    when: ConditionSchema.optional(),
  }),
  z.strictObject({ type: z.literal('auto'), script: ScriptIdSchema, when: ConditionSchema }),
  z
    .strictObject({
      type: z.literal('chest'),
      at: GridPointSchema,
      flag: textThat(
        (flag) => isNamespacedId(flag) && flag.startsWith('chest.'),
        "isn't a chest's flag, like chest.saltmere-01",
      ),
      item: IdSchema.optional(),
      gold: z.int().min(1).optional(),
    })
    .refine((chest) => (chest.item === undefined) !== (chest.gold === undefined), {
      error: 'should hold an item or some gold: one or the other',
    }),
]);

const MapSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
  music: AssetKeySchema.optional(),
  terrain: z.string(),
  /** One character each. */
  legend: z.record(z.string().length(1), IdSchema),
  objects: z.array(MapObjectSchema).optional(),
  edges: z.partialRecord(z.enum(SIDES), WarpTargetSchema).optional(),
});

// Everything else.

/** An item: so far, just what it's called. M3 adds what it does, its price and who can equip it. */
const ItemSchema = z.strictObject({ name: NameSchema });
export type ItemDef = ContentOf<typeof ItemSchema>;

/** Who speaks in the dialogue box: the name in its tab, and a portrait if they have one. */
const SpeakerSchema = z.strictObject({
  /** Empty for signs and narration, which have no name tab. */
  name: z.string(),
  /** An image key from the asset manifest. */
  portrait: AssetKeySchema.optional(),
});
export type Speaker = ContentOf<typeof SpeakerSchema>;

/** How a new game begins (the type is NewGame in src/core/state.ts). */
const NewGameSchema = z.strictObject({
  location: z.strictObject({
    map: IdSchema,
    x: CellSchema,
    y: CellSchema,
    facing: DirectionSchema,
  }),
  party: z.array(IdSchema).min(1).max(MAX_PARTY_SIZE),
  gold: z.int().min(0).optional(),
  inventory: z.record(IdSchema, z.int().min(1)).optional(),
});

const EventScriptSchema = z.custom<EventScript>((value) => typeof value === 'function', {
  error: "isn't an event script",
});

/**
 * All the content `npm run validate` checks against a schema: each collection is a record by ID,
 * and the new game stands alone. A new kind of content adds its collection here.
 */
export const CONTENT_SCHEMAS = {
  items: z.record(IdSchema, ItemSchema),
  speakers: z.record(IdSchema, SpeakerSchema),
  terrains: z.record(IdSchema, TerrainSchema),
  prefabs: z.record(IdSchema, PrefabSchema),
  maps: z.record(IdSchema, MapSchema),
  events: z.record(ScriptIdSchema, EventScriptSchema),
  newGame: NewGameSchema,
};
