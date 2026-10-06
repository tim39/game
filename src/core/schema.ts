import { z } from 'zod';
import { MAX_ENEMIES } from './battle/battle';
import { ELEMENTS, RANKS, REACTIONS, STATUSES, TARGETS, TARGET_RULES } from './battle/terms';
import { DIRECTIONS } from './direction';
import { ARMOR_TYPES, SLOTS, WEAPON_TYPES } from './equipment';
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

/** Text the game shows: a map's or an item's name, say, or what a skill does. */
const TextSchema = z
  .string()
  .min(1)
  .refine((text) => text.trim() === text, { error: 'starts or ends with a space' });
const IdSchema = textThat(isId, "isn't kebab-case, like tide-caves-b1");
const FlagSchema = textThat(isNamespacedId, "isn't a flag, like story.beacon-out");
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

/**
 * What a battle is fought in front of: a small map that fills the screen, of terrain and maybe some
 * prefabs (see src/core/map/backdrop.ts).
 */
const BackdropSchema = z.strictObject({
  terrain: z.string(),
  /** One character each. */
  legend: z.record(z.string().length(1), IdSchema),
  objects: z
    .array(z.strictObject({ type: z.literal('prefab'), prefab: IdSchema, at: GridPointSchema }))
    .optional(),
});
export type BackdropDef = ContentOf<typeof BackdropSchema>;

const MapSchema = z.strictObject({
  id: IdSchema,
  name: TextSchema,
  music: AssetKeySchema.optional(),
  terrain: z.string(),
  /** One character each. */
  legend: z.record(z.string().length(1), IdSchema),
  objects: z.array(MapObjectSchema).optional(),
  edges: z.partialRecord(z.enum(SIDES), WarpTargetSchema).optional(),
  /** An encounter table, and a backdrop. */
  encounters: z.strictObject({ table: IdSchema, backdrop: IdSchema }).optional(),
});

// Battle: what skills and items do (see src/core/battle/terms.ts).

const ElementSchema = z.enum(ELEMENTS);
const StatusSchema = z.enum(STATUSES);
const TargetSchema = z.enum(TARGETS);
/** How hard a skill hits or heals: Attack's power is 1. */
const PowerSchema = z.number().positive();

/** Something an action does to each target, besides the damage or healing of its power. */
const EffectSchema = z.discriminatedUnion('type', [
  /** Pushes the target back in line by this much of its Normal delay. */
  z.strictObject({ type: z.literal('delay'), amount: z.number().positive() }),
  /** Gives the target a status: always, or this share of the time. */
  z.strictObject({
    type: z.literal('status'),
    status: StatusSchema,
    chance: z.number().gt(0).max(1).optional(),
  }),
  /** Takes statuses away. */
  z.strictObject({ type: z.literal('cure'), statuses: z.array(StatusSchema).min(1) }),
  /** Shows how the target takes each element: Insight. */
  z.strictObject({ type: z.literal('reveal') }),
  /** Gives back this much HP or MP, or both. */
  z
    .strictObject({
      type: z.literal('restore'),
      hp: z.int().min(1).optional(),
      mp: z.int().min(1).optional(),
    })
    .refine((restore) => restore.hp !== undefined || restore.mp !== undefined, {
      error: 'should restore some HP or MP',
    }),
  /** Gets a KO'd ally back up, with this share of their HP. */
  z.strictObject({ type: z.literal('revive'), hp: z.number().gt(0).max(1) }),
  /** Deals this much damage, of an element if it names one: a bomb. */
  z.strictObject({
    type: z.literal('damage'),
    amount: z.int().min(1),
    element: ElementSchema.optional(),
  }),
  /** Gets the party out of a battle, unless it's against a boss. */
  z.strictObject({ type: z.literal('escape') }),
]);
const EffectsSchema = z.array(EffectSchema).min(1);

/** What every skill has: its MP cost, and its rank, which sets how soon its user acts again. */
const SKILL = {
  name: TextSchema,
  description: TextSchema,
  mp: z.int().min(0),
  rank: z.enum(RANKS),
};

/** A skill: damage or healing from its power, effects, or both (see The party in DESIGN.md). */
const SkillSchema = z.discriminatedUnion('kind', [
  /** Physical skills pit ATK against DEF, magical ones MAG against RES. */
  z.strictObject({
    ...SKILL,
    kind: z.enum(['physical', 'magical']),
    element: ElementSchema.optional(),
    power: PowerSchema,
    target: TargetSchema.extract(['one-enemy', 'all-enemies']),
    effects: EffectsSchema.optional(),
  }),
  /** Healing goes by MAG. */
  z.strictObject({
    ...SKILL,
    kind: z.literal('healing'),
    power: PowerSchema,
    target: TargetSchema.extract(['self', 'one-ally', 'all-allies']),
    effects: EffectsSchema.optional(),
  }),
  /** Support skills only have effects. */
  z.strictObject({
    ...SKILL,
    kind: z.literal('support'),
    target: TargetSchema,
    effects: EffectsSchema,
  }),
]);
export type SkillDef = ContentOf<typeof SkillSchema>;

// Items.

/** What an item costs in a shop. It sells for half (see Items and economy in DESIGN.md). */
const PriceSchema = z.int().min(1);
/** What equipment adds to its wearer's stats. A penalty is a bonus below 0. */
const BonusSchema = z.strictObject({
  hp: z.int().optional(),
  mp: z.int().optional(),
  atk: z.int().optional(),
  def: z.int().optional(),
  mag: z.int().optional(),
  res: z.int().optional(),
  spd: z.int().optional(),
});
const ITEM = { name: TextSchema, description: TextSchema };

/** An item: something to use up, equipment for one of the three slots, or a key item. */
const ItemSchema = z.discriminatedUnion('kind', [
  /** Used up when used, in battle (a Quick action) or from the menu. */
  z.strictObject({
    ...ITEM,
    kind: z.literal('consumable'),
    price: PriceSchema,
    target: TargetSchema,
    effects: EffectsSchema,
  }),
  /** A weapon of one kind; Attack takes its element, if it has one. */
  z.strictObject({
    ...ITEM,
    kind: z.literal('weapon'),
    price: PriceSchema,
    weapon: z.enum(WEAPON_TYPES),
    element: ElementSchema.optional(),
    stats: BonusSchema,
  }),
  z.strictObject({
    ...ITEM,
    kind: z.literal('armor'),
    price: PriceSchema,
    armor: z.enum(ARMOR_TYPES),
    stats: BonusSchema,
  }),
  /** Anyone can wear an accessory. */
  z.strictObject({ ...ITEM, kind: z.literal('accessory'), price: PriceSchema, stats: BonusSchema }),
  /** A story item: it can't be sold or used up. */
  z.strictObject({ ...ITEM, kind: z.literal('key') }),
]);
export type ItemDef = ContentOf<typeof ItemSchema>;

// The party.

/** A stat at level 1 and at level 30, between which it grows evenly (src/core/stats.ts). */
const growth = (least: number) =>
  z
    .tuple([z.int().min(least), z.int().min(least)])
    .refine(([first, last]) => last >= first, { error: 'is lower at level 30 than at level 1' });

/** A skill a character learns: at a level, or once a story flag is set. */
const LearnSchema = z
  .strictObject({ skill: IdSchema, level: z.int().min(1).optional(), flag: FlagSchema.optional() })
  .refine((learn) => (learn.level === undefined) !== (learn.flag === undefined), {
    error: 'should be learned at a level or with a flag: one or the other',
  });

/** Someone who can be in the party. */
const CharacterSchema = z.strictObject({
  name: TextSchema,
  /** Each stat at level 1 and at level 30. */
  stats: z.strictObject({
    hp: growth(1),
    mp: growth(0),
    atk: growth(0),
    def: growth(0),
    mag: growth(0),
    res: growth(0),
    spd: growth(0),
  }),
  /** The kind of weapon they fight with. */
  weapon: z.enum(WEAPON_TYPES),
  /** The kinds of armor they wear. */
  armor: z.array(z.enum(ARMOR_TYPES)).min(1),
  /** What they're wearing when they join the party. */
  equipment: z.partialRecord(z.enum(SLOTS), IdSchema),
  /** The skills they learn, in the order their menu lists them. */
  skills: z.array(LearnSchema),
});
export type CharacterDef = ContentOf<typeof CharacterSchema>;

// Enemies.

/**
 * When an enemy may take an action: everything named must hold. `hpBelow` is a share of its most
 * HP; `every` counts its own turns (3 is its 3rd, its 6th and so on); and `alliesBelow` counts its
 * side still standing, itself included (2 is when it's alone).
 */
const WHEN = {
  hpBelow: z.number().gt(0).max(1).optional(),
  every: z.int().min(2).optional(),
  alliesBelow: z.int().min(2).optional(),
};
const hasConditions = (when: object): boolean => Object.keys(when).length > 0;
const WhenSchema = z.strictObject(WHEN).refine(hasConditions, { error: 'has no conditions' });
/** A skill can also be kept for `once` a battle. */
const SkillWhenSchema = z
  .strictObject({ ...WHEN, once: z.literal(true).optional() })
  .refine(hasConditions, { error: 'has no conditions' });

/** How likely an action is to be picked, against the others it could take: 1 if not given. */
const WeightSchema = z.number().positive();
const TargetRuleSchema = z.enum(TARGET_RULES);

/**
 * Something an enemy might do on its turn: Attack, Guard or a skill, how likely it is, when, and
 * whom it picks to aim at. A skill can be telegraphed: announced on one turn, and used on the next.
 */
const EnemyActionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('attack'),
    weight: WeightSchema.optional(),
    when: WhenSchema.optional(),
    target: TargetRuleSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('guard'),
    weight: WeightSchema.optional(),
    when: WhenSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('skill'),
    skill: IdSchema,
    weight: WeightSchema.optional(),
    when: SkillWhenSchema.optional(),
    target: TargetRuleSchema.optional(),
    telegraph: z.literal(true).optional(),
  }),
]);
export type EnemyActionDef = ContentOf<typeof EnemyActionSchema>;
const EnemyActionsSchema = z.array(EnemyActionSchema).min(1);

/** A later phase of a boss's: from when its HP first falls below this share, it acts this way. */
const PhaseSchema = z.strictObject({
  below: z.number().gt(0).max(1),
  actions: EnemyActionsSchema,
});

/** Something to fight. */
const EnemySchema = z.strictObject({
  name: TextSchema,
  /** Its stats, which don't grow: each kind of enemy is as strong as where it's met. */
  stats: z.strictObject({
    hp: z.int().min(1),
    mp: z.int().min(0),
    atk: z.int().min(0),
    def: z.int().min(0),
    mag: z.int().min(0),
    res: z.int().min(0),
    spd: z.int().min(0),
  }),
  /** EXP that beating it gives each member of the party, KO'd or not. */
  exp: z.int().min(0),
  /** Gold that beating it gives the party. */
  gold: z.int().min(0),
  /**
   * Items it can leave behind once it's beaten, each rolled for on its own: an item, by ID, and
   * the chance of one, above 0 and at most 1.
   */
  drops: z
    .array(z.strictObject({ item: IdSchema, chance: z.number().gt(0).max(1) }))
    .min(1)
    .optional(),
  /** How it takes each element it doesn't take normally. */
  reactions: z.partialRecord(ElementSchema, z.enum(REACTIONS)).optional(),
  /**
   * A boss can't be fled from or put to sleep, takes half the push of a stagger, and is Slowed for
   * half as long.
   */
  boss: z.boolean().optional(),
  /** What it does on its turn, until a phase changes it. Without any, it attacks. */
  actions: EnemyActionsSchema.optional(),
  /** Its later phases, each starting at less HP than the one before. */
  phases: z
    .array(PhaseSchema)
    .min(1)
    .refine(
      (phases) => phases.every((phase, index) => phase.below < (phases[index - 1]?.below ?? 2)),
      { error: 'should each start at less HP than the one before' },
    )
    .optional(),
});
export type EnemyDef = ContentOf<typeof EnemySchema>;

/**
 * An encounter table: the groups of enemies an area's random battles are against, each as likely
 * as its weight (1 if not given) against the others.
 */
const EncounterTableSchema = z.strictObject({
  groups: z
    .array(
      z.strictObject({
        enemies: z.array(IdSchema).min(1).max(MAX_ENEMIES),
        weight: WeightSchema.optional(),
      }),
    )
    .min(1),
});
export type EncounterTable = ContentOf<typeof EncounterTableSchema>;

// Shops.

/**
 * A shop: what it sells, in the order it lists them, each at its price. It buys anything back
 * but key items, for half (see src/core/shop.ts).
 */
const ShopSchema = z.strictObject({
  items: z
    .array(IdSchema)
    .min(1)
    .refine((items) => new Set(items).size === items.length, { error: 'lists an item twice' }),
});
export type ShopDef = ContentOf<typeof ShopSchema>;

// Everything else.

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
  characters: z.record(IdSchema, CharacterSchema),
  skills: z.record(IdSchema, SkillSchema),
  items: z.record(IdSchema, ItemSchema),
  enemies: z.record(IdSchema, EnemySchema),
  encounters: z.record(IdSchema, EncounterTableSchema),
  shops: z.record(IdSchema, ShopSchema),
  speakers: z.record(IdSchema, SpeakerSchema),
  terrains: z.record(IdSchema, TerrainSchema),
  prefabs: z.record(IdSchema, PrefabSchema),
  maps: z.record(IdSchema, MapSchema),
  backdrops: z.record(IdSchema, BackdropSchema),
  events: z.record(ScriptIdSchema, EventScriptSchema),
  newGame: NewGameSchema,
};
