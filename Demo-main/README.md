# 2D Turn-Based RPG Demo - Blood Tower Plan (血楼计划)

## Overview
This is a turn-based tactical RPG battle system featuring the "Blood Tower Plan" scenario with Heresy cult members as enemies.

## Battle Scenario
- **Map Size**: 26 rows × 18 columns (expanded from 7×14)
- **Player Units**: Dario, Adora, and Karma (all Level 25)
- **Enemy Faction**: Heresy Cult Members with various specialized types

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
- Passives: 忠臣的信仰, 隐Gift, 刺形三角, 接受神的指示

### 赫雷西初代精英成员 (Elite Heresy Members)
- HP: 200 | SP: 50
- Skills: 异臂, 重锤, 献祭, 爆锤
- Passives: 忠臣的信仰, 血污蔓延, 接受神的指示

### 组装型进阶赫雷西成员 (Boss - Member B)
- HP: 250 | SP: 90
- Skills: Support buffs, summoning, and area attacks
- Can summon additional cult members during battle

## Special Mechanics

### 邪教目标 (Cult Target)
- Enemies can mark players with "Cult Target"
- Marked players take bonus damage and trigger追击 (follow-up attacks)

### Status Effects
- **脆弱 (Vulnerability)**: Increases damage taken by 15%, clears at end of turn
- **怨念 (Resentment)**: Drains 5% SP per turn
- **流血 (Bleed)**: Deals 5% max HP damage per turn

### Passives
- **忠臣的信仰**: +10 SP at start of each turn
- **Gift**: 50% chance to reduce incoming damage by 50%
- **强化身体**: +20% damage dealt, -20% damage taken
- **刺形三角**: Ignores all damage reduction (Assassin only)

## How to Play
1. Open `index.html` in a web browser
2. Use step-based action system to move and attack
3. Select skills from your hand to use abilities
4. Defeat all enemy units to win

## Technical Details
- Pure JavaScript implementation
- No external dependencies
- Grid-based tactical combat system
- AI-controlled enemy units with skill probability pools