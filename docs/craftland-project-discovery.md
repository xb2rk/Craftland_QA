# PlantsVsZombiesFCC Discovery Report

Date: 2026-08-07

Source project:
`C:\Users\N0BODY\Documents\Craftland Studio\Projects\PlantsVsZombiesFCC`

Inspection mode: read-only.

## 1. Repository state

- Current branch: `feat/plant-merge-v2`
- Current commit: `65e42df`
- Tracking branch: `origin/feat/plant-merge-v2`
- Working tree was clean during discovery.
- The project uses Craftland FC (`.fcg` / `.fcc`), not ordinary Unity C#.
- Official FC compiler path is provided by
  `Temp/UGCLanguage/fcconfig.json`.

## 2. Config sources

The analyzer must treat both of these as first-class config sources.

### CSV configuration

Gameplay CSV files are stored in `Assets/CSV`. Each file has:

1. Header row.
2. Type row.
3. Data rows.

The current project has 18 gameplay CSV files plus
`Assets/Localization/key.csv`.

CSV data is generally projected into immutable server-side data graphs before
gameplay systems consume it.

Examples:

| Config | Projection | Important consumers |
|---|---|---|
| `PlantData.csv` | `Data/ItemCatalog.fcg` | `PlantStats`, `GardenCombat`, merge and UI |
| `SeedData.csv` | `Data/ItemCatalog.fcg` | `SeedPoolData`, `SeedModel`, `GardenGrowth` |
| `SeedPoolData.csv` | `Data/SeedPoolData.fcg` | seed resolution, garden growth, inventory UI |
| `ZombieData.csv` | `Data/ZombieData.fcg` | spawner, zombie entity, economy, boss UI |
| `BossData.csv` | `Data/BossData.fcg` | boss lifecycle, boss stats, rewards and UI |
| `ShopSlotData.csv` | `Data/ShopSlotData.fcg` | shop manager and seed shop UI |
| `MergeTierData.csv` | `Data/MergeTierData.fcg` | merge tier modifier library |
| `BreakTierData.csv` | `Data/BreakTierData.fcg` | break tier modifier library |

### FC tuple configuration

Important tuning values are also hard-coded as typed tuple defaults in:

- `Assets/Scripts/Contracts/CustomConfig.fcc`
- `Assets/Scripts/Data/GameConfig.fcg`

Domains include:

- inventory capacity;
- garden dimensions and unlock cost;
- zombie pacing and rarity;
- plant stat and cost curves;
- merge cost and size curves;
- economy;
- progression;
- boss timing and reward;
- server time;
- debug access.

An analyzer that scans only CSV files will miss many of the highest-impact
gameplay parameters.

## 3. Deterministic audit result

The initial read-only audit checked:

- header/type row column counts;
- data row column counts;
- expected numeric and string structure;
- duplicate keys;
- CSV references;
- seed-pool plant references;
- seed-pool rate syntax and weight totals;
- shop pool scalar consistency;
- tier order consistency.

Results:

- No column-count errors were found.
- No missing references were found in the implemented cross-table checks.
- All current `SeedPoolData.RateList` rows sum to 100.
- All current seed-pool plant IDs exist in `PlantData`.
- All shop pools currently use consistent currency, stock and enabled values.
- Break-tier and merge-tier rows are currently ordered and have unique
  `(Tier, Order)` pairs.

Repeated first-column values are not automatically errors:

- `BreakTierData` and `MergeTierData` allow multiple effect rows per tier.
- `ShopSlotData` allows multiple items in one `(ShopId, SlotIndex)` pool.

The rule engine therefore needs per-table key profiles rather than a generic
"first column must be unique" rule.

## 4. Confirmed config-to-code mismatches

### Finding 1: boss fight spawn interval does not follow its documented meaning

Severity: high

`BossConfig.FightSpawnIntervalPct` is documented with value `50` meaning normal
zombies spawn twice as fast during a boss fight.

The current implementation:

1. Returns the base interval unchanged whenever the value is `<= 100`.
2. For values above 100, multiplies the interval by the percentage.

This means:

- the current value `50` has no effect;
- a value such as `200` makes spawning slower, not faster.

Evidence:

- `Assets/Scripts/Contracts/CustomConfig.fcc:206`
- `Assets/Scripts/Data/GameConfig.fcg:242`
- `Assets/Scripts/Systems/Zombie/Server_ZombieSpawner.fcg:288`

This is the exact class of issue the analyzer should report as:

- config intent;
- actual formula;
- observed effective result;
- affected boss flow;
- recommended test/simulation.

### Finding 2: boss spawn min/max config has no runtime consumer

Severity: medium

`BossConfig.SpawnMinColumnIndex` and `SpawnMaxColumnIndex` have getters in
`GameConfig`, but no gameplay code calls those getters.

`Server_ZombieSpawner.SelectBossSpawnColumn` instead derives the final garden
column and excludes the two edge columns directly.

Changing either configured min/max value currently has no effect on boss spawn
selection.

Evidence:

- `Assets/Scripts/Contracts/CustomConfig.fcc:199`
- `Assets/Scripts/Data/GameConfig.fcg:221`
- `Assets/Scripts/Systems/Zombie/Server_ZombieSpawner.fcg:349`

The analyzer should classify this as an unused/dead config and show the actual
selection implementation.

## 5. Positive quality/recovery patterns

The report should also recognize protections that already exist.

### Garden combat

- Uses a fixed central cadence rather than one independent loop per plant.
- Validates stale zombie handles before applying damage.
- Schedules the next attack before late damage guards, preventing hot retry
  every tick.
- Reacquires a target when the current target dies during the same column pass.

### Seed growth

- Stores a snapshotted growth duration in placement data.
- Falls back to current base CSV duration for legacy placements.
- Validates tile and placement type before completing growth.

### Merge

- Checks inventory capacity before spending and consuming source plants.
- Refunds spent currency on defensive late failures.
- Uses cloned tuple metadata to avoid leaking mutation through shared list-backed
  tuples.

### Zombie/boss pacing

- Pauses spawn flow for an empty garden or disabled generation.
- Cancels boss preparation when the plant gate becomes invalid.
- Cleans up per-player pacing maps on quit.

These should appear in a quality report as confirmed safeguards, not only as the
absence of findings.

## 6. Context selection profiles

The context builder should use domain-aware profiles.

### Plant combat

Start with:

- `PlantData.csv`
- `ItemData.csv`
- `CustomConfig.fcc`
- `GameConfig.fcg`
- `ItemCatalog.fcg`
- `PlantStats.fcg`
- `ModifierAggregator.fcg`
- `HitPipeline.fcg`
- `Server_GardenCombat.fcg`

### Zombie spawning

Start with:

- `ZombieData.csv`
- `CustomConfig.fcc`
- `GameConfig.fcg`
- `ZombieData.fcg`
- `ZombieModel.fcg`
- `Server_ZombieSpawner.fcg`
- `Server_ZombieManager.fcg`
- `Server_ProgressionManager.fcg`

### Boss flow

Start with:

- `BossData.csv`
- `ZombieData.csv`
- `CustomConfig.fcc`
- `GameConfig.fcg`
- `BossData.fcg`
- `BossStats.fcg`
- `Server_BossManager.fcg`
- `Server_ZombieSpawner.fcg`
- `Server_UIBoss.fcg`

### Seed pool and growth

Start with:

- `SeedData.csv`
- `SeedPoolData.csv`
- `PlantData.csv`
- `ItemData.csv`
- `ItemCatalog.fcg`
- `SeedPoolData.fcg`
- `SeedModel.fcg`
- `Server_GardenGrowth.fcg`

### Merge

Start with:

- `MergeTierData.csv`
- `CustomConfig.fcc`
- `GameConfig.fcg`
- `MergeTierData.fcg`
- `MergeTierLibrary.fcg`
- `PlantModel.fcg`
- `Server_MergeManager.fcg`
- inventory and wallet services.

### Shop

Start with:

- `ShopData.csv`
- `ShopSlotData.csv`
- `ItemData.csv`
- `ShopData.fcg`
- `ShopSlotData.fcg`
- `Server_ShopManager.fcg`
- `Server_UISeedShop.fcg`

## 7. Analyzer implementation consequences

The MVP needs:

1. A CSV parser aware of the header/type/data-row format.
2. A Craftland FC parser/indexer for imports, graphs, functions, enums, tuples
   and calls.
3. A config registry mapping CSV resources to data graph loaders.
4. A call/import graph from data getters to formulas, systems and UI.
5. Per-table uniqueness and reference rules.
6. A formula extractor for FC functions.
7. A dead-config detector for getters with no consumers.
8. A semantic comment-versus-formula check performed by LLM.
9. Simulation adapters for probability, pacing, stat curves and economy.
10. Evidence line preservation in every extracted chunk sent to AI.

The dependency graph should be generated from source on every analysis. Domain
profiles are seed hints, not hard-coded conclusions.

