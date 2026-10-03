/**
 * Event scripts: cutscenes and interactions, written as async functions run against an
 * EventContext (see Event scripts in docs/TECH.md). The context grows a verb at a time as content
 * needs it; so far scripts can talk, and ask the player to choose.
 */
export interface EventContext {
  /**
   * Shows a line in the dialogue box, typed out, and resolves once the player has read it.
   * `speaker` is an ID from src/data/speakers.ts, which gives the name and portrait.
   */
  say(speaker: string, text: string): Promise<void>;
  /**
   * Offers the player one to four choices, over the last line said, and resolves with the index
   * of the one they pick.
   */
  choice(options: readonly string[]): Promise<number>;
}

export type EventScript = (ev: EventContext) => Promise<void>;

export const defineEvent = (script: EventScript): EventScript => script;
