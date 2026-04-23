export type CausalDependencyConfig = {
  dependencies: Record<string, string[]>;
  terminalWeights: Record<string, number>;
  blockThreshold: number;
};

export type CausalSimulationResult = {
  negatedStates: string[];
  terminalWeight: number;
  blocked: boolean;
  threshold: number;
};

const DEFAULT_DEPENDENCIES: Record<string, string[]> = {
  action_grounded: ["truth_preserved"],
  operator_alignment: ["stewardship_intact"],
  safe_execution: ["runtime_stable"],
  runtime_stable: ["continuity_protected"],
  truth_preserved: ["stewardship_intact"],
  stewardship_intact: ["continuity_protected"],
};

const DEFAULT_TERMINAL_WEIGHTS: Record<string, number> = {
  truth_preserved: 0.9,
  stewardship_intact: 0.8,
  runtime_stable: 0.7,
  continuity_protected: 1.0,
};

const DEFAULT_THRESHOLD = 1.0;

export class CausalDependencyModel {
  private readonly dependencies: Record<string, string[]>;
  private readonly terminalWeights: Record<string, number>;
  private readonly blockThreshold: number;

  constructor(config: Partial<CausalDependencyConfig> = {}) {
    this.dependencies = config.dependencies ?? DEFAULT_DEPENDENCIES;
    this.terminalWeights = config.terminalWeights ?? DEFAULT_TERMINAL_WEIGHTS;
    this.blockThreshold = config.blockThreshold ?? DEFAULT_THRESHOLD;
  }

  simulateNegation(initialStates: string[]): CausalSimulationResult {
    const queue = [...new Set(initialStates.filter(Boolean))];
    const negated = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || negated.has(current)) {
        continue;
      }
      negated.add(current);
      for (const dependency of this.dependencies[current] ?? []) {
        if (!negated.has(dependency)) {
          queue.push(dependency);
        }
      }
    }

    let terminalWeight = 0;
    for (const state of negated) {
      terminalWeight += this.terminalWeights[state] ?? 0;
    }

    const negatedStates = [...negated].sort();
    return {
      negatedStates,
      terminalWeight,
      blocked: terminalWeight >= this.blockThreshold,
      threshold: this.blockThreshold,
    };
  }
}

export function createDefaultCausalDependencyModel(): CausalDependencyModel {
  return new CausalDependencyModel();
}
