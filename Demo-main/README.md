# 2D Turn-Based RPG Demo - Blood Tower Plan (血楼计划)

## Overview
This is a turn-based tactical RPG battle system featuring the "Blood Tower Plan" scenario with Heresy cult members as enemies. The game features a multi-wave progression system with destructible walls, environmental hazards, and a climactic boss fight.

## Battle Scenario
- **Map Size**: 26 rows × 18 columns
- **Player Units**: Dario, Adora, and Karma (all Level 25)
- **Enemy Faction**: Heresy Cult Members with various specialized types
- **Progression**: 4 waves of enemies unlocked by destroying walls

## Game Progression

### Wave 1: Initial Encounter
- 4 enemy units appear at the start
- Clear all enemies to make Wall 1 fragile

### Wave 2: Breaking Through
- Destroy fragile Wall 1 to spawn 5 new enemies
- Recovery Tile 1 appears at (3,18) - restores full HP/SP
- Blood fog begins forming behind Wall 1 (activates in 2 turns)

### Wave 3: Elite Forces
- Destroy fragile Wall 2 to spawn 6 enemies including an Elite
- Recovery Tile 2 appears at (16,9)
- Blood fog begins forming behind Wall 2

### Wave 4: Final Boss Battle
- Destroy fragile Wall 3 to trigger boss cutscene
- Boss Member B spawns with 4 support units
- Music changes to boss theme
- Blood fog begins forming behind Wall 3

## Enemy Types

### 雏形赫雷西成员 (Basic Heresy Members)
- HP: 150 | SP: 70
- Skills: 干扰者死, 追上, 献祭, 讨回公道
- Passives: 忠臣的信仰, Gift, 强化身体, 接受神的指示

### 法形赫雷西成员 (Mage Heresy Members)
- HP: 100 | SP: 90
- Skills: 魔音影响, 追上, 献祭, 毫无尊严
- Passives: 忠臣的信仰, Gift, 强化身体, 接受神的指示

### 刺形赫雷西成员 (Assassin Heresy Members)
- HP: 50 | SP: 100
- Skills: 割喉, 暗袭, 献祭, 血溅当场
- Passives: 忠臣的信仰, 隐Gift (Invisibility), 刺形三角, 接受神的指示

### 赫雷西初代精英成员 (Elite Heresy Members)
- HP: 200 | SP: 50
- Skills: 异臂, 重锤, 献祭, 爆锤
- Passives: 忠臣的信仰, 血污蔓延 (Blood Stain), 接受神的指示
- Special: Requires 2 stagger stacks to stun

### Boss Member B
- HP: 250 | SP: 90
- Skills: 以神明之名 series (Blessing, Care, Freedom), Summoning skills, 清除
- Can summon additional cult members during battle
  - **协助我们！** (2 SP cost): Summons a Basic Heresy Member at half HP (75/150)
  - **辅助我们！** (3 SP cost): Summons a Mage Heresy Member at half HP (50/100)
  - **暗杀令** (2 SP cost): Summons an Assassin Heresy Member at half HP (25/50)
- Heals nearby allies each turn
- Special: Requires 3 stagger stacks to stun

## Special Mechanics

### Destructible Walls
- 3 walls block progression through the tower
- Walls become **fragile** after clearing all enemies in current wave
- Fragile walls can be destroyed by clicking on them
- Destroying walls spawns the next wave and starts blood fog countdown

### Blood Fog Zones
- Activate 2 turns after wall destruction
- Deal 50 HP + 50 SP damage per turn
- Apply 10 layers of Bleed + 10 layers of Resentment
- Affect all player units in the zone

### Recovery Tiles
- Healing stations that restore full HP and SP
- Grant 鸡血 (Adrenaline) buff: next attack deals double damage
- **Tile 1** appears after destroying Wall 1 at position (3,18) - one-time use
- **Tile 2** appears after destroying Wall 2 at position (16,9) - one-time use
- **Tile 3** appears after destroying Wall 3 at position (4,12) - **respawns every 10 rounds**

### 邪教目标 (Cult Target)
- Enemies can mark players with "Cult Target"
- Marked players take bonus damage from many skills
- Triggers 追击 (follow-up attacks) from certain abilities

### Status Effects
- **脆弱 (Vulnerability)**: Increases damage taken by 15%, clears at end of turn
- **怨念 (Resentment)**: Drains 5% SP per turn
- **流血 (Bleed)**: Deals 5% max HP damage per turn
- **鸡血 (Adrenaline)**: Next attack deals double damage

### Passives
- **忠臣的信仰**: +10 SP at start of each turn
- **Gift**: 50% chance to reduce incoming damage by 50%
- **强化身体**: +20% damage dealt, -20% damage taken
- **刺形三角**: Ignores all damage reduction (Assassin only)
- **隐Gift**: Grants invisibility (Assassin only)
- **血污蔓延**: Attacked tiles become blood stains (Elite only)

## How to Play
1. Open `index.html` in a web browser
2. Use step-based action system to move and attack
3. Select skills from your hand to use abilities
4. Clear each wave to make walls fragile
5. Click fragile walls to destroy them and progress
6. Use recovery tiles strategically for full heals
7. Avoid blood fog zones when possible
8. Defeat Boss Member B to win

## Audio (Optional)
- Place `Tower.mp3` in the same directory for background music
- Place `成员B.mp3` for boss fight music
- Game will function without audio files

## Technical Details
- Pure JavaScript implementation
- No external dependencies
- Grid-based tactical combat system (26x18)
- AI-controlled enemy units with skill probability pools
- Dynamic wave spawning system
- Environmental hazards (walls, blood fog)
- Interactive special tiles (recovery stations)