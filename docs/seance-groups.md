# Séance family: the group library

The Séance (heroes), The Bazaar (items) and The Grimoire (abilities) each deal four tables a day: three category types and a mixed table.
Every table needs **at least 16 usable groups** (at least 4 members and a clear yes or no for every entity) so a board never repeats too soon;
this file is generated from the committed API backup and lists what exists. Regenerate it after changing the derivations
(the counts are enforced by `src/tests/seance-data.test.ts`).

## Where the groups come from

| Source | How | Truth |
|---|---|---|
| API fields | hero archetype, weapon type, complexity, tags, gender, item slot, cost, components, tooltip stat bonuses | exact |
| API numbers | gun cycle time, clip, pellets, damage, move speed, stamina, ability cooldown, charges, cast range, duration, stun and slow values | exact, fixed cuts |
| Ability behaviour flags | only an allowlist of player-facing flags (channelled, projectile, movement, heal, self-cast, ...) | exact |
| Description text | item and ability descriptions searched for effect words (slow, stun, heal, barrier, ...); the label says what the text mentions | text match |
| Lore text | the official lore: "mentions New York", "mentions family" (text match) plus a hand-written tag table read from the lore (monster hunters, criminals, undead, ...) | hand-checked |
| Release dates | the wiki's hero infoboxes | exact |
| Looks (heroes, items, abilities) | every portrait and icon was looked at once and tagged (hats, beards, bullets, hearts, eyes, ...); an entity not in a tag table is a clear "no" | hand-checked |

Heroes, items and abilities added later are **unknown** for the hand-written tables until an admin classifies them (the Review Queue); derived groups include new entities automatically.

## Heroes: The Séance

### mechanics (36 usable groups, 38 entities)

| Members | Difficulty | Group |
|---:|:---:|---|
| 12 | 1 | Archetype: Marksman |
| 9 | 1 | Archetype: Mystic |
| 8 | 1 | Archetype: Brawler |
| 9 | 1 | Archetype: Assassin |
| 6 | 2 | Weapon type: Rapid Fire |
| 5 | 2 | Weapon type: Burst Fire |
| 8 | 2 | Weapon type: Pistol |
| 7 | 2 | Weapon type: Spreadshot |
| 11 | 3 | Complexity: 1 star |
| 15 | 3 | Complexity: 2 stars |
| 11 | 3 | Complexity: 3 stars |
| 4 | 3 | Hero tag: Initiator |
| 4 | 2 | Can heal their allies |
| 7 | 4 | Can target themselves with an ability |
| 20 | 2 | Has a movement ability |
| 25 | 4 | Has a projectile ability |
| 23 | 3 | Has a channelled ability |
| 11 | 4 | Has an ability with an alternate cast |
| 9 | 3 | Has an ability with multiple charges |
| 10 | 3 | Has an ability that stuns |
| 5 | 3 | Base health 850 or more |
| 4 | 3 | Base health under 700 |
| 8 | 3 | Fires 10 or more bullets per second |
| 9 | 3 | Fires 2 or fewer bullets per second |
| 8 | 3 | Clip of 30 or more bullets |
| 7 | 3 | Clip of 10 or fewer bullets |
| 8 | 2 | Gun fires several pellets at once |
| 9 | 4 | 18 or more damage per bullet |
| 8 | 4 | 5 or less damage per bullet |
| 6 | 4 | Move speed of 7.9 or more |
| 5 | 4 | Move speed of 6.3 or less |
| 6 | 3 | Only 2 stamina |
| 4 | 3 | 4 stamina |
| 17 | 3 | Ultimate is channelled |
| 5 | 4 | Ultimate fires a projectile |
| 5 | 4 | Ultimate moves them |

### lore (19 usable groups, 38 entities)

| Members | Difficulty | Group |
|---:|:---:|---|
| 17 | 2 | Lore mentions New York |
| 14 | 2 | Lore mentions family |
| 4 | 2 | Monster hunters |
| 4 | 2 | Scientists and inventors |
| 8 | 2 | Criminals |
| 6 | 2 | Dead, undead or ghost |
| 11 | 2 | Not born human |
| 8 | 3 | Folklore creatures |
| 4 | 3 | Works for pay |
| 6 | 3 | Practise magic |
| 4 | 3 | Wealth or fame |
| 5 | 3 | Fights with a partner or companion |
| 10 | 4 | Real name given in their lore |
| 6 | 4 | Died in their backstory |
| 19 | 2 | In the game from the start |
| 7 | 3 | Added late 2024 or January 2025 |
| 4 | 3 | Joined in January 2025 |
| 6 | 3 | Joined in August 2025 |
| 6 | 3 | Joined in 2026 |

### visuals (21 usable groups, 38 entities)

| Members | Difficulty | Group |
|---:|:---:|---|
| 10 | 1 | Wears a hat or cap |
| 5 | 2 | Wears glasses or goggles |
| 8 | 1 | Has a beard or mustache |
| 4 | 2 | Has horns |
| 5 | 2 | Has glowing eyes |
| 5 | 2 | Has an animal or creature face |
| 6 | 2 | No face shown |
| 6 | 2 | Has long hair |
| 4 | 3 | Has red or orange hair |
| 6 | 2 | Blue, green or red skin |
| 6 | 2 | Wears red |
| 6 | 2 | Wears orange or yellow |
| 5 | 2 | Wears blue |
| 4 | 2 | Wears purple |
| 5 | 3 | Has green accents |
| 6 | 3 | Wears earrings or a necklace |
| 4 | 3 | Shows fangs |
| 5 | 3 | Wears a tie or bow tie |
| 4 | 3 | Is grinning |
| 15 | 1 | Female heroes |
| 22 | 1 | Male heroes |

## Items: The Bazaar

### stats (31 usable groups, 156 entities)

| Members | Difficulty | Group |
|---:|:---:|---|
| 53 | 1 | Weapon items |
| 54 | 1 | Vitality items |
| 49 | 1 | Spirit items |
| 44 | 2 | Active items |
| 78 | 3 | Items with a cooldown |
| 43 | 3 | Components of other items |
| 62 | 2 | Upgrades built from other items |
| 23 | 2 | Costs 800 souls |
| 43 | 2 | Costs 1,600 souls |
| 46 | 2 | Costs 3,200 souls |
| 44 | 2 | Costs 6,400 souls |
| 8 | 3 | Gives max ammo |
| 23 | 1 | Gives weapon damage |
| 27 | 1 | Gives out-of-combat health regen |
| 7 | 3 | Gives fire rate |
| 46 | 1 | Gives bonus health |
| 5 | 4 | Gives bullet velocity |
| 20 | 1 | Gives spirit power |
| 5 | 4 | Gives melee damage |
| 5 | 4 | Gives melee resist |
| 4 | 4 | Gives debuff resist |
| 5 | 4 | Gives stamina recovery |
| 4 | 4 | Gives move speed |
| 16 | 2 | Gives sprint speed |
| 17 | 2 | Gives spirit resist |
| 15 | 2 | Gives bullet resist |
| 5 | 4 | Gives bullet lifesteal |
| 4 | 4 | Gives health regen |
| 5 | 4 | Gives spirit lifesteal |
| 4 | 4 | Gives stamina |
| 7 | 3 | Gives ability range |

### effects (18 usable groups, 156 entities)

| Members | Difficulty | Group |
|---:|:---:|---|
| 10 | 2 | Slows enemies |
| 6 | 2 | Stuns enemies |
| 8 | 2 | Silences enemies |
| 28 | 1 | Heals |
| 8 | 2 | Gives a barrier |
| 5 | 3 | Grants immunity or unstoppable |
| 4 | 4 | Disarms |
| 5 | 2 | Steals life |
| 5 | 3 | Affects reloading |
| 5 | 3 | Dashes or teleports |
| 6 | 3 | Launches or pulls enemies |
| 8 | 3 | Stacks up |
| 5 | 3 | Applies a debuff |
| 7 | 3 | Works with melee |
| 6 | 3 | Has charges |
| 6 | 4 | Triggers at low health |
| 4 | 4 | Burns, bleeds or poisons |
| 18 | 2 | Mentions speed |

### visuals (24 usable groups, 156 entities)

| Members | Difficulty | Group |
|---:|:---:|---|
| 18 | 2 | An eye on the icon |
| 9 | 2 | A heart on the icon |
| 11 | 2 | A plus or cross on the icon |
| 26 | 1 | Bullets or ammo on the icon |
| 22 | 2 | A hand or fist on the icon |
| 20 | 2 | An animal on the icon |
| 4 | 3 | A horse on the icon |
| 4 | 3 | A snake on the icon |
| 9 | 2 | Wings on the icon |
| 5 | 3 | A skull on the icon |
| 10 | 2 | A devil or demon on the icon |
| 14 | 2 | A human figure on the icon |
| 12 | 2 | Armor or a shield on the icon |
| 7 | 3 | Lightning on the icon |
| 9 | 2 | Flames on the icon |
| 5 | 2 | A clock or hourglass on the icon |
| 7 | 3 | A blade on the icon |
| 4 | 3 | A pistol on the icon |
| 12 | 3 | An explosion burst on the icon |
| 5 | 3 | A mouth or fangs on the icon |
| 4 | 4 | Circular arrows on the icon |
| 5 | 3 | Chains or cuffs on the icon |
| 4 | 4 | Bones on the icon |
| 4 | 4 | A pentagram or triangle on the icon |

## Abilities: The Grimoire

### mechanics (35 usable groups, 152 entities)

| Members | Difficulty | Group |
|---:|:---:|---|
| 38 | 1 | Ability 1 of a hero |
| 38 | 1 | Ability 2 of a hero |
| 38 | 1 | Ability 3 of a hero |
| 38 | 1 | Ultimates |
| 31 | 2 | Channelled abilities |
| 34 | 2 | Fires a projectile |
| 26 | 2 | Movement abilities |
| 75 | 3 | Needs no target |
| 19 | 3 | Targets a unit |
| 11 | 4 | Has an alternate cast |
| 7 | 4 | Can be cast on yourself |
| 4 | 2 | Heals other players |
| 13 | 4 | Projectile flies through walls |
| 5 | 4 | Castable on a zipline |
| 6 | 4 | Does not stop your sprint |
| 8 | 4 | Cooldown starts when the channel ends |
| 9 | 3 | Has several charges |
| 27 | 3 | Cooldown of 20 seconds or less |
| 37 | 3 | Cooldown of 60 seconds or more |
| 109 | 2 | Deals spirit damage |
| 11 | 3 | Has a stun duration |
| 47 | 3 | Has a slow |
| 18 | 4 | Cast range of 30 meters or more |
| 18 | 4 | Lasts for a set duration |
| 48 | 2 | Ability of a Marksman |
| 36 | 2 | Ability of a Mystic |
| 32 | 2 | Ability of a Brawler |
| 36 | 2 | Ability of a Assassin |
| 20 | 3 | Ability of a Rapid Fire hero |
| 20 | 3 | Ability of a Burst Fire hero |
| 8 | 3 | Ability of a Long Range hero |
| 32 | 3 | Ability of a Pistol hero |
| 8 | 3 | Ability of a Heavy Hitter hero |
| 28 | 3 | Ability of a Spreadshot hero |
| 8 | 3 | Ability of a Projectile hero |

### effects (22 usable groups, 152 entities)

| Members | Difficulty | Group |
|---:|:---:|---|
| 44 | 1 | Slows enemies |
| 16 | 1 | Stuns enemies |
| 29 | 1 | Heals |
| 8 | 3 | Knocks enemies back |
| 8 | 3 | Pulls enemies in |
| 4 | 3 | Makes you unstoppable or invulnerable |
| 12 | 2 | Dashes or leaps |
| 4 | 3 | Teleports |
| 17 | 3 | Launches enemies into the air |
| 5 | 3 | Summons something |
| 7 | 3 | Creates a wall |
| 12 | 2 | Explodes |
| 13 | 3 | Burns, bleeds or poisons |
| 11 | 3 | Builds up stacks |
| 29 | 3 | Boosts or changes your gun |
| 4 | 3 | Immobilizes enemies |
| 8 | 3 | Boosts fire rate |
| 17 | 2 | Grants bonus move speed |
| 14 | 3 | Grants resistance |
| 13 | 3 | Tosses or pushes enemies |
| 43 | 2 | Damages over time |
| 15 | 2 | Helps allies |

### visuals (21 usable groups, 152 entities)

| Members | Difficulty | Group |
|---:|:---:|---|
| 24 | 1 | A person on the icon |
| 7 | 2 | Flames on the icon |
| 6 | 2 | Lightning on the icon |
| 9 | 2 | An explosion on the icon |
| 7 | 2 | A bomb or grenade on the icon |
| 6 | 2 | A gun or ammo on the icon |
| 11 | 2 | A blade on the icon |
| 12 | 2 | A hand or claws on the icon |
| 6 | 3 | A heart on the icon |
| 14 | 2 | An animal on the icon |
| 5 | 3 | Wings on the icon |
| 8 | 3 | A skull or devil on the icon |
| 5 | 3 | Snow or ice on the icon |
| 6 | 3 | A plus or cross on the icon |
| 4 | 3 | An eye on the icon |
| 13 | 2 | Stars or sparkles on the icon |
| 4 | 3 | A moon on the icon |
| 6 | 3 | A swirl or tornado on the icon |
| 4 | 3 | A bottle or flask on the icon |
| 6 | 3 | Chains, ropes or whips on the icon |
| 4 | 3 | Missiles or arrows on the icon |

