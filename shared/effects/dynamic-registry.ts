import type { FC } from "react";
import type { EffectComponentProps } from "./entrances";
import { compileEffect, compileEffectAsync } from "./compile";

/**
 * Registry that merges statically-imported built-in effects with
 * dynamically compiled effects (from source strings).
 *
 * Built-in effects are always available and cannot be overridden.
 * Dynamic effects are compiled via `compileEffect()` and cached.
 */
export class DynamicEffectRegistry {
  private builtIn: Record<string, FC<EffectComponentProps>>;
  private dynamic: Record<string, { component: FC<EffectComponentProps>; code: string }> = {};

  constructor(builtIn: Record<string, FC<EffectComponentProps>>) {
    this.builtIn = { ...builtIn };
  }

  /**
   * Register a dynamic effect by compiling its source code (synchronous).
   * Requires sucrase to be preloaded. Throws if compilation fails.
   */
  register(name: string, code: string): void {
    const component = compileEffect(code);
    this.dynamic[name] = { component, code };
  }

  /**
   * Register a dynamic effect by compiling its source code (async).
   * Automatically loads sucrase on first use.
   */
  async registerAsync(name: string, code: string): Promise<void> {
    const component = await compileEffectAsync(code);
    this.dynamic[name] = { component, code };
  }

  /**
   * Remove a dynamic effect. Built-in effects cannot be unregistered.
   */
  unregister(name: string): void {
    delete this.dynamic[name];
  }

  /**
   * Look up an effect by name. Built-in effects take priority over dynamic ones.
   */
  get(name: string): FC<EffectComponentProps> | undefined {
    return this.builtIn[name] ?? this.dynamic[name]?.component;
  }

  /**
   * Return the source code for a dynamic effect (used for serialization).
   * Returns undefined for built-in effects or unknown names.
   */
  getCode(name: string): string | undefined {
    return this.dynamic[name]?.code;
  }

  /**
   * List all registered effect names (built-in + dynamic, merged).
   */
  listAll(): string[] {
    return [...new Set([...Object.keys(this.builtIn), ...Object.keys(this.dynamic)])];
  }

  /**
   * Check if a name is a dynamic (non-built-in) effect.
   */
  isDynamic(name: string): boolean {
    return name in this.dynamic && !(name in this.builtIn);
  }

  /**
   * Get all dynamic effects as a record of name -> code, for serialization.
   */
  getAllDynamicCode(): Record<string, string> {
    return Object.fromEntries(
      Object.entries(this.dynamic).map(([name, { code }]) => [name, code]),
    );
  }
}
