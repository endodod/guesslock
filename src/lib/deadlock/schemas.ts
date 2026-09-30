// Zod schemas for the Deadlock assets API, derived from real responses of
// /v1/assets/heroes?only_active=true&language=english and /v1/assets/items?language=english.
// Unknown keys are stripped; every entity is validated individually so a single malformed
// entry is logged and excluded instead of failing the whole sync.
import { z } from "zod";

const optStr = z.string().nullish();
const optBool = z.boolean().nullish();
const num = z.union([z.number(), z.string()]).nullish();

export const HeroRawSchema = z.object({
  id: z.number(),
  class_name: z.string(),
  name: z.string(),
  player_selectable: optBool,
  disabled: optBool,
  in_development: optBool,
  needs_testing: optBool,
  assigned_players_only: optBool,
  prerelease_only: optBool,
  limited_testing: optBool,
  gender: optStr,
  hero_type: optStr,
  complexity: z.number().nullish(),
  gun_tag: optStr,
  tags: z.array(z.string()).nullish(),
  description: z
    .object({ lore: optStr, role: optStr, playstyle: optStr })
    .nullish(),
  images: z.record(z.string(), z.string().nullish()).nullish(),
  items: z.record(z.string(), z.string()),
  starting_stats: z.record(z.string(), z.object({ value: z.number() }).partial()).nullish(),
});
export type HeroRaw = z.infer<typeof HeroRawSchema>;

export const PropertySchema = z.object({
  value: num,
  label: optStr,
  postfix: optStr,
  prefix: optStr,
  display_units: optStr,
  usage_flags: z.array(z.string()).nullish(),
  conditional: z.unknown().optional(),
  scale_function: z.unknown().optional(),
  provided_property_type: optStr,
  negative_attribute: optBool,
});
export type PropertyRaw = z.infer<typeof PropertySchema>;

const PropertyUpgradeSchema = z.object({ name: z.string(), bonus: num });

export const ItemBaseSchema = z.object({
  id: z.number(),
  class_name: z.string(),
  name: z.string().nullish(),
  type: z.string(),
  image: optStr,
  image_webp: optStr,
  hero: z.number().nullish(),
  heroes: z.array(z.number()).nullish(),
  properties: z.record(z.string(), PropertySchema).nullish(),
});

export const WeaponSchema = ItemBaseSchema.extend({
  weapon_info: z
    .object({ bullet_damage: z.number().nullish(), damage_per_second: z.number().nullish() })
    .nullish(),
});

export const AbilitySchema = ItemBaseSchema.extend({
  ability_type: optStr,
  description: z
    .object({
      desc: optStr, quip: optStr, t1_desc: optStr, t2_desc: optStr, t3_desc: optStr,
    })
    .nullish(),
  upgrades: z.array(z.object({ property_upgrades: z.array(PropertyUpgradeSchema).nullish() })).nullish(),
});
export type AbilityRaw = z.infer<typeof AbilitySchema>;

export const UpgradeSchema = ItemBaseSchema.extend({
  name: z.string(),
  item_slot_type: z.enum(["weapon", "vitality", "spirit"]),
  item_tier: z.number(),
  cost: z.number().nullish(),
  shopable: optBool,
  disabled: optBool,
  activation: optStr,
  is_active_item: optBool,
  component_items: z.array(z.string()).nullish(),
  shop_image: optStr,
  description: z.object({ desc: optStr }).nullish(),
  tooltip_sections: z
    .array(
      z.object({
        section_type: optStr,
        section_attributes: z
          .array(
            z.object({
              properties: z.array(z.string()).nullish(),
              elevated_properties: z.array(z.string()).nullish(),
              loc_string: optStr,
            }),
          )
          .nullish(),
      }),
    )
    .nullish(),
});
export type UpgradeRaw = z.infer<typeof UpgradeSchema>;

export const SteamInfoSchema = z.object({ client_version: z.number() });

// Analytics
export const ItemStatsRowSchema = z.object({
  item_id: z.number(),
  bucket: z.number(),
  matches: z.number(),
});
export const HeroStatsRowSchema = z.object({ hero_id: z.number(), matches: z.number() });
