// ============================================================
// survival.js
// Sistemas de sobrevivência: fome, sede, sangramento, infecção.
// Baseado na mecânica do Zumbi Blocks 2.
// ============================================================

import * as bus from './src/core/bus.js';
import { Ev } from './src/core/events.js';

export const SurvivalConfig = {
  maxHunger: 100,
  maxThirst: 100,
  maxBlood:   100,
  maxHealth:  100,

  hungerDrainPerSec:  0.55,   // ~3min até 0
  thirstDrainPerSec:  0.75,   // ~2.2min até 0
  sprintDrainMul:     2.5,
  hungerDamage:       1.5,    // dano por seg com fome 0
  thirstDamage:       2.0,

  bleedTickRate:      1.0,    // tick a cada 1s
  bleedDamageBase:    2.0,
  bleedHealPerBandage: 40,

  infectionChance:    0.15,   // 15% por hit de zumbi
  infectionDamagePerSec: 0.5,
  infectionCureAntidote: true,

  healthRegenDelay:   12,     // seg sem dano pra regenerar
  healthRegenPerSec:  1.5,
};

export class SurvivalSystem {
  constructor() {
    this.hunger  = SurvivalConfig.maxHunger;
    this.thirst  = SurvivalConfig.maxThirst;
    this.blood   = SurvivalConfig.maxBlood;

    this.bleeding = false;
    this.bleedTickTimer = 0;
    this.infected = false;
    this.infectionTimer = 0;

    this.lastDamageTime = 0;
    this.regenTimer = 0;

    this.active = false;
  }

  reset() {
    this.hunger  = SurvivalConfig.maxHunger;
    this.thirst  = SurvivalConfig.maxThirst;
    this.blood   = SurvivalConfig.maxBlood;
    this.bleeding = false;
    this.bleedTickTimer = 0;
    this.infected = false;
    this.infectionTimer = 0;
    this.lastDamageTime = performance.now() / 1000;
    this.regenTimer = 0;
    this.active = true;
  }

  // ════════ Dano causado por zumbi (chance de sangramento/infecção) ════════
  onPlayerHit(damage) {
    this.lastDamageTime = performance.now() / 1000;
    this.regenTimer = 0;

    // Chance de sangramento (40% se dano >= 15)
    if (Math.random() < (damage >= 15 ? 0.6 : 0.25)) {
      this.bleeding = true;
    }

    // Chance de infecção (15%)
    if (Math.random() < SurvivalConfig.infectionChance) {
      if (!this.infected) {
        this.infected = true;
        this.infectionTimer = 0;
        bus.emit('survival:infected', {});
      }
    }
  }

  // ════════ Consumíveis ════════
  consumeFood(amount = 25) {
    this.hunger = Math.min(SurvivalConfig.maxHunger, this.hunger + amount);
  }
  consumeDrink(amount = 30) {
    this.thirst = Math.min(SurvivalConfig.maxThirst, this.thirst + amount);
  }
  useBandage() {
    this.blood = Math.min(SurvivalConfig.maxBlood, this.blood + SurvivalConfig.bleedHealPerBandage);
    this.bleeding = false;
  }
  useAntidote() {
    if (this.infected) {
      this.infected = false;
      this.infectionTimer = 0;
      bus.emit('survival:infected_cured', {});
    }
  }

  // ════════ Update por frame ════════
  update(dt, state) {
    if (!this.active) return;
    const now = performance.now() / 1000;

    // Fome
    this.hunger = Math.max(0, this.hunger - SurvivalConfig.hungerDrainPerSec * dt);

    // Sede
    const sprintMul = state.isSprinting ? SurvivalConfig.sprintDrainMul : 1;
    this.thirst = Math.max(0, this.thirst - SurvivalConfig.thirstDrainPerSec * sprintMul * dt);

    // Sangramento (perde sangue com o tempo)
    if (this.bleeding) {
      this.bleedTickTimer += dt;
      if (this.bleedTickTimer >= SurvivalConfig.bleedTickRate) {
        this.bleedTickTimer = 0;
        this.blood = Math.max(0, this.blood - SurvivalConfig.bleedDamageBase);
        state.health = Math.max(1, state.health - SurvivalConfig.bleedDamageBase);
        bus.emit('survival:bleed_tick', {});
      }
    } else {
      // Regenera sangue devagar quando não sangrando
      this.blood = Math.min(SurvivalConfig.maxBlood, this.blood + 0.5 * dt);
    }

    // Infecção
    if (this.infected) {
      this.infectionTimer += dt;
      state.health -= SurvivalConfig.infectionDamagePerSec * dt;
    }

    // Dano por fome/sede zeradas
    if (this.hunger <= 0) state.health -= SurvivalConfig.hungerDamage * dt;
    if (this.thirst <= 0) state.health -= SurvivalConfig.thirstDamage * dt;

    // Regeneração natural
    if (!this.bleeding && !this.infected && this.hunger > 20 && this.thirst > 20) {
      const sinceDamage = now - this.lastDamageTime;
      if (sinceDamage > SurvivalConfig.healthRegenDelay) {
        state.health = Math.min(state.maxHealth,
          state.health + SurvivalConfig.healthRegenPerSec * dt);
      }
    }

    // Clamp
    state.health = Math.max(0, state.health);
  }

  // ════════ Getters pra HUD ════════
  getHungerFrac() { return this.hunger / SurvivalConfig.maxHunger; }
  getThirstFrac() { return this.thirst / SurvivalConfig.maxThirst; }
  getBloodFrac()  { return this.blood  / SurvivalConfig.maxBlood; }
  isBleeding()    { return this.bleeding; }
  isInfected()    { return this.infected; }
}

// Singleton
export const survival = new SurvivalSystem();
