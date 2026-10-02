/**
 * Event scripts: cutscenes and interactions, written as async functions run against an
 * EventContext (see Event scripts in docs/TECH.md). The context grows a verb at a time as content
 * needs it; so far scripts can only talk.
 */
export interface EventContext {
  /**
   * Shows a line in the dialogue box, and resolves once the player has read it. `speaker` is an ID
   * from src/data/speakers.ts, which gives the name and portrait.
   */
  say(speaker: string, text: string): Promise<void>;
}

export type EventScript = (ev: EventContext) => Promise<void>;

export const defineEvent = (script: EventScript): EventScript => script;
